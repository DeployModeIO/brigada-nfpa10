'use strict';
const jwt = require('jsonwebtoken');
const config = require('../config');

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const m = header.match(/^Bearer\s+(.+)$/i);
  if (!m) return res.status(401).json({ error: 'unauthorized', msg: 'Falta token Bearer' });
  try {
    req.user = jwt.verify(m[1], config.authSecret);
    return next();
  } catch (_) {
    return res.status(401).json({ error: 'unauthorized', msg: 'Token inválido o expirado' });
  }
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
