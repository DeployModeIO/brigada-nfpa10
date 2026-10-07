'use strict';
// Hub SSE en tiempo real (V2.1 O&G): publicarEvento → clientes conectados.
const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');

const eventos = require('../src/lib/eventos');

test('publicarEvento dispara el evento con ts en el bus', () => {
  const recibidos = [];
  const listener = (e) => recibidos.push(e);
  eventos.__busParaPruebas().on('evento', listener);
  const publicado = eventos.publicarEvento('inspeccion_creada', { tag: 'EXT-PC-001' });
  assert.equal(publicado.tipo, 'inspeccion_creada');
  assert.equal(recibidos.length, 1);
  assert.equal(recibidos[0].tag, 'EXT-PC-001');
  assert.ok(recibidos[0].ts, 'debe incluir timestamp');
  eventos.__busParaPruebas().off('evento', listener);
});

test('streamSSE rechaza token inválido con 401', async () => {
  const res = {
    statusCode: 0,
    writeHead(code) { this.statusCode = code; },
    write() {},
    end() {},
  };
  const req = { query: { token: 'token-malo' }, on() {} };
  await eventos.streamSSE(req, res);
  assert.equal(res.statusCode, 401);
});

test('streamSSE con token válido abre el flujo 200 y envía evento conectado', async () => {
  // Token sin `id`: usuarioDeToken lo acepta directo (sin consulta a BD)
  const config = require('../src/config');
  const token = jwt.sign({ username: 'admin', rol: 'admin' }, config.authSecret, { algorithm: 'HS256' });
  const escritos = [];
  const res = {
    statusCode: 0,
    writeHead(code, headers) {
      this.statusCode = code;
      assert.equal(headers['Content-Type'], 'text/event-stream');
    },
    write(chunk) { escritos.push(String(chunk)); },
    on() {},
  };
  const req = { query: { token }, on() {} };
  await eventos.streamSSE(req, res);
  assert.equal(res.statusCode, 200);
  assert.ok(escritos.some((c) => c.includes('event: conectado')), 'debe enviar event: conectado');
  eventos.publicarEvento('prueba_broadcast', { ok: 1 });
  assert.ok(escritos.some((c) => c.includes('prueba_broadcast')), 'debe difundir eventos del bus');
});
