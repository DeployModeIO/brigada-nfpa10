'use strict';
// FIXES de seguridad 03/10/2026 — brigada-nfpa10 cubre: C1 (guard + seed [SETUP]),
// A1 (change-password, CRUD admin, revocación), A4 (referencia/espejo — tests
// propios en referencia.test.js), M2 (CSV/XLSX). M1 no aplica: brigada no trata RUT.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.SMOKE_PORT || '3215', 10);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brigada-sec-'));
Object.assign(process.env, {
  DB_DRIVER: 'sqlite',
  DB_PATH: path.join(tmp, 'sec.db'),
  PORT: String(PORT),
  NODE_ENV: 'test',
  AUTH_SECRET: 'test-secret'
});

const db = require('../src/db');
const { migrate } = require('../src/db/migrate');
const { csvCell } = require('../src/lib/reemplazos');
const { SEG } = require('../src/routes/export');

const BASE = `http://127.0.0.1:${PORT}/api/v1`;
let started = null;
async function srv() {
  if (started) return started;
  await migrate();
  const { runSeed } = require('../seeds/seed');
  await runSeed();
  const { buildApp } = require('../src/app');
  const server = buildApp().listen(PORT, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  started = server;
  return server;
}
async function api(p, opts = {}, token) {
  await srv();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${p}`, { ...opts, headers });
  return { status: r.status, body: await r.json().catch(() => null) };
}
async function login(u, p) { return (await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) })).body; }
test.after(async () => {
  if (started) started.close();
  await db.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('C1: guard AUTH_SECRET en producción (spawn)', () => {
  const run = (env) => execFileSync('node', ['-e', 'require("./src/config.js")'],
    { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' });
  assert.throws(() => run({ NODE_ENV: 'production', AUTH_SECRET: '' }));
  assert.throws(() => run({ NODE_ENV: 'production', AUTH_SECRET: 'REVISAR-ANTES-DE-PRESENTACION' }));
  assert.doesNotThrow(() => run({ NODE_ENV: 'production', AUTH_SECRET: 'f'.repeat(40) }));
});

test('C1/A1: seed en producción genera passwords aleatorias impresas una vez como [SETUP]', () => {
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'brigada-seed-prod-'));
  let out = '';
  try {
    out = execFileSync('node', ['seeds/seed.js'], {
      cwd: ROOT,
      env: { ...process.env, NODE_ENV: 'production', AUTH_SECRET: 'x'.repeat(32), DB_PATH: path.join(tmp2, 'p.db'), DEMO_SEED: '' },
      encoding: 'utf8', timeout: 60000
    });
  } finally {
    fs.rmSync(tmp2, { recursive: true, force: true });
  }
  assert.match(out, /^\[SETUP\] admin password: \S{16,}$/m);
  assert.ok(!out.includes('Br1g@d4!n'), 'no usa la credencial del README en producción');
});

test('A1: demo/test conservan credenciales conocidas y el login informa must_change_password', async () => {
  const r = await login('admin', 'Br1g@d4!n');
  assert.equal(r.token ? 200 : 401, 200);
  assert.equal(r.user.must_change_password, false, 'seed de test: clave conocida, sin flag');
});

test('A1: change-password + CRUD admin + revocación invalida tokens emitidos', async () => {
  const admin = (await login('admin', 'Br1g@d4!n')).token;
  const alta = await api('/admin/users', { method: 'POST', body: JSON.stringify({ username: 'sec-brig', password: 'ClaveSegura1!', nombre: 'Brigadista Prueba', rol: 'inspector' }) }, admin);
  assert.equal(alta.status, 201);
  assert.ok(!('password_hash' in alta.body));
  const tk = (await login('sec-brig', 'ClaveSegura1!')).token;
  // gate A1 (2ª auditoría): la clave provisional bloquea rutas normales
  const gate = await api('/extinguishers?size=1', {}, tk);
  assert.equal(gate.status, 403);
  assert.equal(gate.body.error, 'password_change_required');
  const cp = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ password_actual: 'ClaveSegura1!', password_nueva: 'OtraClaveSegura2!' }) }, tk);
  assert.equal(cp.status, 200);
  assert.equal((await api('/extinguishers?size=1', {}, tk)).status, 200, 'tras el cambio, el gate se levanta');
  const rev = await api(`/admin/users/${alta.body.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'revocado' }) }, admin);
  assert.equal(rev.status, 200);
  const after = await api('/extinguishers?size=1', {}, tk);
  assert.equal(after.status, 401);
  assert.equal(after.body.error, 'cuenta_revocada');
});

test('M2: csvCell y SEG neutralizan fórmulas en reemplazos.csv e informe xlsx', () => {
  assert.equal(csvCell('=1+2'), "'=1+2");
  assert.equal(csvCell('+3'), "'+3");
  assert.deepEqual(SEG({ tag: '@x', n: 1 }), { tag: "'@x", n: 1 });
});

// ───────────── A1 gate (2ª auditoría) ─────────────
test('A1 gate: must_change_password bloquea rutas salvo /auth/change-password | /auth/me | /auth/logout', async () => {
  const admin = (await login('admin', 'Br1g@d4!n')).token;
  const alta = await api('/admin/users', { method: 'POST', body: JSON.stringify({ username: 'sec-gate-brig', password: 'ClaveSegura1!', nombre: 'Gate', rol: 'inspector' }) }, admin);
  assert.equal(alta.status, 201);
  const lg = await login('sec-gate-brig', 'ClaveSegura1!');
  assert.equal(lg.user.must_change_password, true, 'alta con clave provisional');
  const tk = lg.token;
  const bloqueado = await api('/extinguishers?size=1', {}, tk);
  assert.equal(bloqueado.status, 403);
  assert.equal(bloqueado.body.error, 'password_change_required');
  assert.equal((await api('/auth/me', {}, tk)).status, 200, '/auth/me sigue disponible para leer la sesión');
  const cp = await api('/auth/change-password', { method: 'POST', body: JSON.stringify({ password_actual: 'ClaveSegura1!', password_nueva: 'GatePass2!' }) }, tk);
  assert.equal(cp.status, 200, 'change-password NO lo bloquea el gate');
  const lg2 = await login('sec-gate-brig', 'GatePass2!');
  assert.equal(lg2.user.must_change_password, false);
  assert.equal((await api('/extinguishers?size=1', {}, lg2.token)).status, 200, 'tras el cambio, rutas habilitadas');
});
