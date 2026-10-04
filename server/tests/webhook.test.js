'use strict';
// Webhook saliente con X-API-Key (integración n8n/ERP del cliente): el header se envía
// SOLO cuando settings.webhookApi está configurado; payload {evento,data,ts}; flujo admin
// de punta a punta vía PATCH /settings + POST /alerts/webhook-test contra un sink local.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PORT = parseInt(process.env.SMOKE_PORT || '3265', 10);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wh-xapikey-'));
Object.assign(process.env, {
  DB_DRIVER: 'sqlite',
  DB_PATH: path.join(tmp, 'wh.db'),
  PORT: String(PORT),
  NODE_ENV: 'test',
  AUTH_SECRET: 'test-secret'
});

const db = require('../src/db');
const { migrate } = require('../src/db/migrate');
const { runSeed } = require('../seeds/seed');
const { sendEvent } = require('../src/lib/webhook');

const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const ADMIN_PASS = 'Br1g@d4!n';
const CLAVE = 'sk-test-0123456789abcdef';
let server = null;
let sink = null;
const received = [];

async function boot() {
  if (server) return;
  await migrate();
  await runSeed();
  sink = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      let body = null;
      try { body = JSON.parse(raw); } catch (_) {}
      received.push({ headers: req.headers, body });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('{"ok":true}');
    });
  });
  await new Promise((r) => sink.listen(0, '127.0.0.1', r));
  process.env.WH_SINK_URL = `http://127.0.0.1:${sink.address().port}/hook`;
  server = require('../src/app').buildApp().listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
}

async function api(p, opts = {}, token) {
  await boot();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${p}`, { ...opts, headers });
  return { status: r.status, body: await r.json().catch(() => null) };
}

test('PATCH /settings webhookUrl+webhookApi ⇒ POST /alerts/webhook-test entrega evento con X-API-Key', async () => {
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }) });
  assert.equal(login.status, 200);
  const tok = login.body.token;
  const patch = await api('/settings', { method: 'PATCH', body: JSON.stringify({ webhookUrl: process.env.WH_SINK_URL, webhookApi: CLAVE }) }, tok);
  assert.equal(patch.status, 200);
  assert.equal(patch.body.webhookApi, CLAVE);
  const t = await api('/alerts/webhook-test', { method: 'POST', body: '{}' }, tok);
  assert.equal(t.status, 200, JSON.stringify(t.body));
  assert.equal(t.body.ok, true);
  const ev = received[received.length - 1];
  assert.equal(ev.headers['x-api-key'], CLAVE);
  assert.equal(ev.body.evento, 'webhook_test');
  assert.equal(typeof ev.body.ts, 'string');
  assert.equal(typeof ev.body.data, 'object');
});

test('webhookApi vacío ⇒ header X-API-Key NO se envía (fail-silent sigue entregando)', async () => {
  const login = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: ADMIN_PASS }) });
  const tok = login.body.token;
  const patch = await api('/settings', { method: 'PATCH', body: JSON.stringify({ webhookApi: '' }) }, tok);
  assert.equal(patch.status, 200);
  const t = await api('/alerts/webhook-test', { method: 'POST', body: '{}' }, tok);
  assert.equal(t.status, 200, JSON.stringify(t.body));
  const ev = received[received.length - 1];
  assert.equal(ev.headers['x-api-key'], undefined);
});

test('sendEvent sin webhookUrl ⇒ skipped, sin excepción (fail-silent)', async () => {
  await boot();
  await db.run("DELETE FROM settings WHERE skey = 'webhookUrl'");
  const r = await sendEvent('probe', {});
  assert.equal(r.skipped, true);
});

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  if (sink) await new Promise((r) => sink.close(r));
  await db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) {}
});
