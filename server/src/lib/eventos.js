'use strict';
// Hub de eventos en tiempo real (V2.1 O&G · DEC "tiempo real"):
// SSE /api/v1/events — el campo inspecciona → todos los tableros abiertos
// se refrescan al instante sin esperar polling.
const { EventEmitter } = require('events');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db');

const bus = new EventEmitter();
bus.setMaxListeners(50);
const clientes = new Set();

// Publica un evento a todos los tableros conectados. Fail-silent por diseño:
// el guardado ya ocurrió; perder el aviso nunca debe romper la operación.
function publicarEvento(tipo, datos = {}) {
  const evento = { tipo, ...datos, ts: new Date().toISOString() };
  bus.emit('evento', evento);
  return evento;
}

async function usuarioDeToken(token) {
  try {
    const payload = jwt.verify(String(token || ''), config.authSecret);
    if (payload.rol === 'chofer' || payload.scope === 'asistencia') return null;
    if (!payload.id) return payload;
    const u = await db.get('SELECT id, rol, activo, status FROM users WHERE id = ?', [payload.id]);
    if (!u || Number(u.activo) === 0 || String(u.status || 'activo') === 'revocado') return null;
    return { ...payload, rol: u.rol };
  } catch (_) {
    return null;
  }
}

// GET /events?token=<jwt> — flujo SSE con heartbeat de 25 s.
async function streamSSE(req, res) {
  let user = null;
  try { user = await usuarioDeToken(req.query.token); } catch (_) { user = null; }
  if (!user) {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ error: 'unauthorized', msg: 'Token inválido o revocado' }));
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.write(`event: conectado\ndata: ${JSON.stringify({ usuario: user.username, rol: user.rol })}\n\n`);

  const onEvento = (evento) => {
    try { res.write(`event: ${evento.tipo}\ndata: ${JSON.stringify(evento)}\n\n`); } catch (_) { /* cliente caído */ }
  };
  const heartbeat = setInterval(() => {
    try { res.write(': hb\n\n'); } catch (_) { /* ignore */ }
  }, 25_000);
  if (typeof heartbeat.unref === 'function') heartbeat.unref(); // no retiene el proceso en tests

  bus.on('evento', onEvento);
  clientes.add(res);
  req.on('close', () => {
    bus.off('evento', onEvento);
    clearInterval(heartbeat);
    clientes.delete(res);
  });
}

function clientesConectados() { return clientes.size; }

module.exports = { publicarEvento, streamSSE, clientesConectados, __busParaPruebas: () => bus };
