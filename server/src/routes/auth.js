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
    const user = await db.get(
      'SELECT id, username, password_hash, nombre, rol FROM users WHERE username = ? AND activo = 1',
      [username.trim()]
    );
    // Hash bcrypt fijo si no existe usuario, para equiparar tiempos.
    const hash = user ? user.password_hash : '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinva';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !ok) {
      return res.status(401).json({ error: 'invalid_credentials', msg: 'Credenciales incorrectas' });
    }
    const payload = { id: user.id, username: user.username, nombre: user.nombre, rol: user.rol };
    const token = signToken(payload);
    res.json({ token, user: payload });
  } catch (e) { next(e); }
});

module.exports = router;
