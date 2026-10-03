'use strict';
// FIXES seguridad 03/10/2026 (línea Minería Suite):
//  - A1: revocación EFECTIVA — la autenticación verifica el estado del usuario en BD en
//    cada request; user.status='revocado' (o activo=0) invalida de inmediato tokens ya
//    emitidos. El rol se refresca desde BD (degradar un rol surte al instante).
//  - A1 (gate 2ª auditoría): must_change_password=1 bloquea toda ruta que no sea
//    /auth/change-password | /auth/me | /auth/logout (403 password_change_required).
//  - C2 (checklist-flota, inocuo para el resto de la línea): los tokens de asistencia de
//    chofer (rol 'chofer' / scope 'asistencia') quedan RECHAZADOS en toda ruta
//    autenticada; su único destino es POST /public/inspecciones (que los valida aparte).
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

let tablaConColumnasA1 = true; // false si la BD aún no tiene las columnas de la migración A1

async function estadoUsuario(id) {
  if (tablaConColumnasA1) {
    try {
      return await db.get('SELECT id, rol, activo, status, must_change_password FROM users WHERE id = ?', [id]);
    } catch (e) {
      if (/no such column|unknown column|invalid column|does not exist/i.test(String(e && e.message))) tablaConColumnasA1 = false;
      else throw e;
    }
  }
  return db.get('SELECT id, rol, activo FROM users WHERE id = ?', [id]);
}

async function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'unauthorized', msg: 'Falta token Bearer' });
  let payload;
  try {
    payload = jwt.verify(m[1], config.authSecret);
  } catch (_) {
    return res.status(401).json({ error: 'unauthorized', msg: 'Token inválido o expirado' });
  }
  if (payload.rol === 'chofer' || payload.scope === 'asistencia') {
    return res.status(403).json({ error: 'forbidden', msg: 'Token de asistencia no habilita rutas internas' });
  }
  if (payload.id) {
    let u;
    try { u = await estadoUsuario(payload.id); } catch (e) { return next(e); }
    if (!u || Number(u.activo) === 0 || String(u.status || 'activo') === 'revocado') {
      return res.status(401).json({ error: 'cuenta_revocada', msg: 'Usuario inexistente, dado de baja o revocado' });
    }
    payload.rol = u.rol;
    payload.must_change_password = Number(u.must_change_password) === 1;
  }
  req.user = payload;
  // A1 (2ª auditoría 03/10/2026): gate de contraseña provisional — con
  // must_change_password=1 SOLO se sirve la autogestión de la clave; cualquier otra
  // ruta responde 403 {error:'password_change_required'} hasta el cambio efectivo.
  if (payload.must_change_password) {
    const ruta = String(req.originalUrl || req.path || '/').split('?')[0];
    if (!/\/auth\/(change-password|me|logout)$/.test(ruta)) {
      return res.status(403).json({ error: 'password_change_required', msg: 'Debes cambiar tu contraseña antes de usar otras rutas' });
    }
  }
  return next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'unauthorized', msg: 'No autenticado' });
    if (!roles.includes(req.user.rol)) {
      return res.status(403).json({ error: 'forbidden', msg: `Se requiere rol: ${roles.join(' | ')}` });
    }
    return next();
  };
}

function signToken(user) {
  return jwt.sign(
    { id: user.id, username: user.username, nombre: user.nombre, rol: user.rol },
    config.authSecret,
    { expiresIn: config.tokenTtl, algorithm: 'HS256' }
  );
}

module.exports = { auth, requireRole, signToken };
