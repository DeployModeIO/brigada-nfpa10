'use strict';
// A1 (fixes 03/10/2026): CRUD de usuarios SOLO admin.
//  - GET   /admin/users      listado SIN password_hash
//  - POST  /admin/users      alta (password exigida, must_change_password=1 en el alta)
//  - PUT|PATCH /admin/users/:id  edición de estado (activo|revocado) / datos / reset pwd.
//    NO hay borrado: revocar (status='revocado') desactiva al instante tokens emitidos
//    (ver middleware/auth.js). Un admin no puede revocarse a sí mismo (anti-lockout).
const express = require('express');
const bcrypt = require('bcryptjs');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { cleanStr } = require('../middleware/validate');

const router = express.Router();

const ROLES = ['admin', 'supervisor', 'inspector'];
const USER_RE = /^[a-z0-9._-]{3,64}$/;

function validarAlta(body) {
  const errs = [];
  const username = cleanStr(body.username, 64);
  const password = typeof body.password === 'string' ? body.password : '';
  const nombre = cleanStr(body.nombre, 128) || '';
  const rol = cleanStr(body.rol, 16);
  if (!username || !USER_RE.test(username)) errs.push('username: 3-64 chars [a-z0-9._-]');
  if (password.length < 8 || password.length > 128) errs.push('password: mínimo 8 caracteres');
  if (!ROLES.includes(rol)) errs.push(`rol: ${ROLES.join('|')}`);
  return { errs, username, password, nombre, rol };
}

router.get('/admin/users', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const rows = await db.all(
      'SELECT id, username, nombre, rol, activo, status, must_change_password, created_at FROM users ORDER BY id ASC'
    );
    res.json({ items: rows.map((r) => ({ ...r, must_change_password: Number(r.must_change_password) === 1 })), total: rows.length });
  } catch (e) { next(e); }
});

router.post('/admin/users', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { errs, username, password, nombre, rol } = validarAlta(req.body || {});
    if (errs.length) return res.status(400).json({ error: 'bad_request', msg: errs.join('; ') });
    if (await db.get('SELECT id FROM users WHERE username = ?', [username])) {
      return res.status(409).json({ error: 'username_existe', msg: 'Ese username ya está registrado' });
    }
    const r = await db.run(
      `INSERT INTO users (username, password_hash, nombre, rol, activo, status, must_change_password, created_at)
       VALUES (?, ?, ?, ?, 1, 'activo', 1, ?)`,
      [username, bcrypt.hashSync(password, 10), nombre || username, rol, new Date().toISOString()]
    );
    const u = await db.get('SELECT id, username, nombre, rol, status, must_change_password FROM users WHERE id = ?', [r.lastInsertRowid]);
    res.status(201).json(u);
  } catch (e) { next(e); }
});

async function editarUsuario(req, res, next) {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'bad_request', msg: 'id inválido' });
    const target = await db.get('SELECT id, username, rol, status, must_change_password FROM users WHERE id = ?', [id]);
    if (!target) return res.status(404).json({ error: 'not_found', msg: 'Usuario no encontrado' });
    const body = req.body || {};
    const unknown = Object.keys(body).filter((k) => !['estado', 'nombre', 'rol', 'password'].includes(k));
    if (unknown.length) return res.status(400).json({ error: 'bad_request', msg: `Claves no permitidas: ${unknown.join(', ')}` });

    const sets = []; const params = [];
    if (body.estado !== undefined) {
      const estado = cleanStr(body.estado, 16);
      if (!['activo', 'revocado'].includes(estado)) {
        return res.status(400).json({ error: 'bad_request', msg: 'estado: activo | revocado' });
      }
      if (estado === 'revocado' && Number(req.user.id) === id) {
        return res.status(400).json({ error: 'auto_revocacion', msg: 'No puedes revocarte a ti mismo (anti-bloqueo del sistema)' });
      }
      sets.push('status = ?'); params.push(estado);
      // revocar también baja el flag clásico; reactivar lo sube (los dos viajan juntos)
      sets.push('activo = ?'); params.push(estado === 'revocado' ? 0 : 1);
    }
    if (body.nombre !== undefined) {
      const nombre = cleanStr(body.nombre, 128);
      if (!nombre) return res.status(400).json({ error: 'bad_request', msg: 'nombre inválido' });
      sets.push('nombre = ?'); params.push(nombre);
    }
    if (body.rol !== undefined) {
      const rol = cleanStr(body.rol, 16);
      if (!ROLES.includes(rol)) return res.status(400).json({ error: 'bad_request', msg: `rol: ${ROLES.join('|')}` });
      if (Number(req.user.id) === id && rol !== 'admin') {
        return res.status(400).json({ error: 'auto_degradacion', msg: 'Un admin no puede quitarse su propio rol' });
      }
      sets.push('rol = ?'); params.push(rol);
    }
    if (body.password !== undefined) {
      const pwd = typeof body.password === 'string' ? body.password : '';
      if (pwd.length < 8 || pwd.length > 128) return res.status(400).json({ error: 'bad_request', msg: 'password: mínimo 8 caracteres' });
      sets.push('password_hash = ?'); params.push(bcrypt.hashSync(pwd, 10));
      sets.push('must_change_password = 1');
    }
    if (!sets.length) return res.status(400).json({ error: 'bad_request', msg: 'Nada que actualizar' });
    params.push(id);
    await db.run(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    const u = await db.get('SELECT id, username, nombre, rol, status, must_change_password FROM users WHERE id = ?', [id]);
    res.json(u);
  } catch (e) { next(e); }
}

router.put('/admin/users/:id', auth, requireRole('admin'), editarUsuario);
router.patch('/admin/users/:id', auth, requireRole('admin'), editarUsuario);

module.exports = router;
