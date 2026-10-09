'use strict';
// Importación fiel (migración 006_importacion): conserva la fecha de captura, el inspector
// original y ancla el vencimiento NFPA a la captura; idempotente por captura_id (SELECT).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brigada-import-'));
Object.assign(process.env, {
  DB_DRIVER: 'sqlite',
  DB_PATH: path.join(tmp, 'import.db'),
  NODE_ENV: 'test',
  AUTH_SECRET: 'test-secret'
});

const db = require('../src/db');
const { runSeed } = require('../seeds/seed');

const DIA_MS = 86400000;
let server = null;
let BASE = null;

async function boot() {
  if (server) return;
  await runSeed();
  const { buildApp } = require('../src/app');
  server = buildApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}/api/v1`;
}

async function api(p, opts = {}, token) {
  await boot();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${p}`, { ...opts, headers });
  return { status: r.status, body: await r.json().catch(() => null) };
}

let _tok = null;
async function tokens() {
  if (_tok) return _tok;
  await boot();
  const login = async (u, p) => (await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: u, password: p }) })).body.token;
  const admin = await login('admin', 'Br1g@d4!n');
  const inspector = await login('inspector', '1nsp3ct0r');
  const brig = await login('brigadista', 'Br1g@d1st4!');
  const adminRow = await db.get("SELECT id FROM users WHERE username = 'admin'");
  _tok = { admin, inspector, brig, adminId: adminRow.id };
  return _tok;
}

async function checklist() {
  const rows = await db.all('SELECT clave FROM checklist_items WHERE activo = 1');
  const r = {};
  for (const x of rows) r[x.clave] = true;
  return r;
}

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
});

test('fidelidad: created_at = creado_en y vencimiento anclado a la captura (no a ahora)', async () => {
  const { admin } = await tokens();
  const resultados = await checklist();
  const creado = new Date(Date.now() - 10 * DIA_MS).toISOString();
  const cap = 'cap-fiel-1';
  const r = await api('/inspections/import', {
    method: 'POST',
    body: JSON.stringify({ captura_id: cap, creado_en: creado, inspector_username: 'inspector', tag: 'EXTF-COC-021', resultados })
  }, admin);
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.duplicado, false);
  assert.equal(r.body.fecha, creado, 'fecha de respuesta = captura original');
  // Anclado a la captura: 10 días atrás + 30 d ⇒ hoy + 20 d (NO el ingenuo ahora + 30 d).
  assert.equal(r.body.proximo_vencimiento, new Date(Date.parse(creado) + 30 * DIA_MS).toISOString());
  assert.notEqual(r.body.proximo_vencimiento, new Date(Date.now() + 30 * DIA_MS).toISOString());
  const row = await db.get('SELECT created_at, captura_id, origen, inspector_username, habilitacion FROM inspecciones WHERE id = ?', [r.body.id]);
  assert.equal(row.created_at, creado, 'created_at persistido = captura');
  assert.equal(row.captura_id, cap);
  assert.equal(row.origen, 'campo');
  assert.equal(row.inspector_username, 'inspector', 'inspector original resuelto');
  assert.equal(row.habilitacion, 'vigente');
});

test('idempotencia: el mismo captura_id dos veces ⇒ un solo insert, duplicado:true', async () => {
  const { admin } = await tokens();
  const resultados = await checklist();
  const cap = 'cap-idem-1';
  const body = JSON.stringify({ captura_id: cap, creado_en: new Date(Date.now() - DIA_MS).toISOString(), tag: 'EXTF-ALM-022', resultados });
  const a = await api('/inspections/import', { method: 'POST', body }, admin);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.duplicado, false);
  const b = await api('/inspections/import', { method: 'POST', body }, admin);
  assert.equal(b.status, 200);
  assert.equal(b.body.duplicado, true);
  assert.equal(b.body.captura_id, cap);
  const rows = await db.all('SELECT id FROM inspecciones WHERE captura_id = ?', [cap]);
  assert.equal(rows.length, 1, 'no se duplica en reimportación');
});

test('inspector: existente usa su identidad; desconocido ⇒ admin + nota; vencido ⇒ importa igual', async () => {
  const { admin, adminId } = await tokens();
  const resultados = await checklist();
  const base = { creado_en: new Date(Date.now() - 2 * DIA_MS).toISOString(), resultados };

  // (a) usuario de terreno INEXISTENTE ⇒ firma el admin importador con nota.
  const a = await api('/inspections/import', {
    method: 'POST',
    body: JSON.stringify({ ...base, captura_id: 'cap-ghost', inspector_username: 'fantasma', tag: 'EXTF-OFI-023' })
  }, admin);
  assert.equal(a.status, 201, JSON.stringify(a.body));
  let row = await db.get('SELECT inspector_id, inspector_username, habilitacion FROM inspecciones WHERE id = ?', [a.body.id]);
  assert.equal(row.inspector_id, adminId);
  assert.equal(row.inspector_username, 'admin');
  assert.equal(row.habilitacion, 'importado_terreno:fantasma');

  // (b) inspector con habilitación VENCIDA ⇒ igual se importa, con nota de auditoría.
  const b = await api('/inspections/import', {
    method: 'POST',
    body: JSON.stringify({ ...base, captura_id: 'cap-brig', inspector_username: 'brigadista', tag: 'EXTF-LAB-024' })
  }, admin);
  assert.equal(b.status, 201, JSON.stringify(b.body));
  row = await db.get('SELECT inspector_username, habilitacion FROM inspecciones WHERE id = ?', [b.body.id]);
  assert.equal(row.inspector_username, 'brigadista');
  assert.equal(row.habilitacion, 'importado_hab_vencida');
});

test('origen: campo en importación y local en la ruta normal; el rechazo por habilitación sigue igual', async () => {
  const { admin, brig } = await tokens();
  const resultados = await checklist();
  const imp = await api('/inspections/import', {
    method: 'POST',
    body: JSON.stringify({ captura_id: 'cap-origen', creado_en: new Date(Date.now() - DIA_MS).toISOString(), tag: 'EXTF-VEH-025', resultados })
  }, admin);
  assert.equal(imp.status, 201, JSON.stringify(imp.body));
  let row = await db.get('SELECT origen, captura_id FROM inspecciones WHERE id = ?', [imp.body.id]);
  assert.equal(row.origen, 'campo');
  assert.equal(row.captura_id, 'cap-origen');

  const norm = await api('/inspections', { method: 'POST', body: JSON.stringify({ tag: 'EXTF-EXP-026', resultados }) }, admin);
  assert.equal(norm.status, 201, JSON.stringify(norm.body));
  assert.equal(norm.body.habilitacion, 'exenta_admin', 'comportamiento original intacto');
  row = await db.get('SELECT origen, captura_id FROM inspecciones WHERE id = ?', [norm.body.id]);
  assert.equal(row.origen, 'local');
  assert.equal(row.captura_id, null);

  const rech = await api('/inspections', { method: 'POST', body: JSON.stringify({ tag: 'EXTF-EXP-026', resultados }) }, brig);
  assert.equal(rech.status, 403);
  assert.equal(rech.body.error, 'habilitacion_vencida');
});

test('solo admin: un inspector recibe 403 en /inspections/import', async () => {
  const { inspector } = await tokens();
  const resultados = await checklist();
  const r = await api('/inspections/import', { method: 'POST', body: JSON.stringify({ tag: 'EXTF-ALM-022', resultados }) }, inspector);
  assert.equal(r.status, 403);
});

test('validación: creado_en futura/inválida y tag faltante ⇒ 400 {error,msg}', async () => {
  const { admin } = await tokens();
  const resultados = await checklist();
  const fut = await api('/inspections/import', { method: 'POST', body: JSON.stringify({ creado_en: new Date(Date.now() + DIA_MS).toISOString(), tag: 'EXTF-COC-021', resultados }) }, admin);
  assert.equal(fut.status, 400);
  assert.equal(fut.body.error, 'bad_request');
  const inv = await api('/inspections/import', { method: 'POST', body: JSON.stringify({ creado_en: 'no-es-fecha', tag: 'EXTF-COC-021', resultados }) }, admin);
  assert.equal(inv.status, 400);
  const sinTag = await api('/inspections/import', { method: 'POST', body: JSON.stringify({ resultados }) }, admin);
  assert.equal(sinTag.status, 400);
  assert.equal(sinTag.body.error, 'bad_request');
});

test('importaciones: acumula contadores agregados por meta.archivo_hash', async () => {
  const { admin } = await tokens();
  const resultados = await checklist();
  const hash = 'hash-demo-001';
  const mk = (captura_id, tag) => JSON.stringify({ captura_id, creado_en: new Date(Date.now() - DIA_MS).toISOString(), tag, resultados, meta: { archivo_hash: hash } });
  await api('/inspections/import', { method: 'POST', body: mk('cap-agg-1', 'EXTF-POR-027') }, admin);
  await api('/inspections/import', { method: 'POST', body: mk('cap-agg-2', 'EXTF-TAL-028') }, admin);
  await api('/inspections/import', { method: 'POST', body: mk('cap-agg-1', 'EXTF-POR-027') }, admin); // duplicado
  const rows = await db.all('SELECT total, creados, duplicados FROM importaciones WHERE archivo_hash = ?', [hash]);
  assert.equal(rows.length, 1, 'una sola fila agregada por hash');
  assert.equal(Number(rows[0].total), 3);
  assert.equal(Number(rows[0].creados), 2);
  assert.equal(Number(rows[0].duplicados), 1);
});