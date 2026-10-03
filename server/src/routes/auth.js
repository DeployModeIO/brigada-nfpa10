'use strict';
const express = require('express');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { signToken, auth } = require('../middleware/auth');

const router = express.Router();

// Sesion actual: payload del JWT (id, username, nombre, rol) — sin password_hash.
router.get('/auth/me', auth, (req, res) => {
  res.json({ user: req.user });
});

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', msg: 'Demasiados intentos de login (20/min)' }
});

router.post('/auth/login', loginLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
      return res.status(400).json({ error: 'bad_request', msg: 'username y password son requeridos' });
    }
    let user;
    try {
      user = await db.get(
        'SELECT id, username, password_hash, nombre, rol, status, must_change_password FROM users WHERE username = ? AND activo = 1',
        [username.trim()]
      );
    } catch (e) {
      if (!/no such column|unknown column/i.test(String((e && e.message) || ''))) throw e;
      user = await db.get(
        'SELECT id, username, password_hash, nombre, rol FROM users WHERE username = ? AND activo = 1',
        [username.trim()]
      );
    }
    if (user && String(user.status || 'activo') === 'revocado') user = null;
    // Hash bcrypt fijo si no existe usuario, para equiparar tiempos.
    const hash = user ? user.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) {
      return res.status(401).json({ error: 'invalid_credentials', msg: 'Credenciales incorrectas' });
    }
    const payload = { id: user.id, username: user.username, nombre: user.nombre, rol: user.rol, must_change_password: Number(user.must_change_password) === 1 };
    const token = signToken(payload);
    res.json({ token, user: payload });
  } catch (e) { next(e); }
});


// A1: cualquier usuario autenticado puede cambiar su propia contraseña.
const changeLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'too_many_requests', msg: 'Demasiados cambios de clave (10/min)' }
});

router.post('/auth/change-password', auth, changeLimiter, async (req, res, next) => {
  try {
    const body = req.body || {};
    const actual = typeof body.password_actual === 'string' ? body.password_actual : '';
    const nueva = typeof body.password_nueva === 'string' ? body.password_nueva : '';
    if (!actual) return res.status(400).json({ error: 'bad_request', msg: 'password_actual requerida' });
    if (nueva.length < 8 || nueva.length > 128) return res.status(400).json({ error: 'bad_request', msg: 'password_nueva: mínimo 8 caracteres' });
    if (actual === nueva) return res.status(400).json({ error: 'bad_request', msg: 'La clave nueva debe ser distinta a la actual' });
    const u = await db.get('SELECT id, password_hash FROM users WHERE id = ?', [req.user.id]);
    if (!u || !(await bcrypt.compare(actual, u.password_hash))) {
      return res.status(401).json({ error: 'password_actual_incorrecta', msg: 'La contraseña actual no coincide' });
    }
    await db.run('UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [bcrypt.hashSync(nueva, 10), u.id]);
    res.json({ ok: true, msg: 'Contraseña actualizada' });
  } catch (e) { next(e); }
});

module.exports = router;
