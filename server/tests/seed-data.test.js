'use strict';
// Datos del seed (criterios 2, 19 y 20): reglas y críticos cargados; demo ficticia;
// RUT solo en users (minimización Ley 19.628).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-test-'));
process.env.DB_DRIVER = 'sqlite';
process.env.DB_URL = path.join(tmp, 'seed.db');
process.env.DB_PATH = process.env.DB_URL;

const db = require('../src/db');
const { runSeed } = require('../seeds/seed.js');

test.before(async () => { await runSeed(); });
test.after(async () => { await db.close(); fs.rmSync(tmp, { recursive: true, force: true }); });

test('Criterio 2: los 3 críticos del §7.2 están marcados en BD', async () => {
  const rows = await db.all('SELECT clave FROM checklist_items WHERE critico = 1 AND activo = 1');
  assert.deepEqual(rows.map((r) => r.clave).sort(), ['manguera_sin_fisuras', 'manometro_rango', 'precinto_intacto']);
});

test('Criterio 2: reglas de vencimiento NFPA cargadas como datos', async () => {
  const rows = await db.all('SELECT agente, hidro_anios, recarga_meses, mensual_dias FROM nfpa_reglas ORDER BY agente');
  const map = Object.fromEntries(rows.map((r) => [r.agente, r.hidro_anios]));
  assert.equal(map.PQS, 12, 'PQS acero: 12 años');
  assert.equal(map.CO2, 5);
  assert.equal(map.AGUA, 5);
  assert.ok(rows.every((r) => r.recarga_meses === 12 && r.mensual_dias === 30));
});

test('Habilitaciones demo: inspector vigente, brigadista vencida (criterio 5)', async () => {
  const rows = await db.all("SELECT u.username, h.vigente_hasta FROM habilitaciones h JOIN users u ON u.id = h.brigadista_user_id");
  const by = Object.fromEntries(rows.map((r) => [r.username, Date.parse(r.vigente_hasta)]));
  assert.ok(by.inspector > Date.now());
  assert.ok(by.brigadista < Date.now());
});

test('Criterio 19: sin RUT/datos personales fuera de users', async () => {
  const exts = await db.all('SELECT * FROM extintores');
  for (const e of exts) {
    const txt = `${e.notas || ''} ${e.metadata || ''}`;
    assert.ok(!/\brut\b|1-9\d{6}-[\dkKvV]/i.test(txt), `metadata/notas con RUT en ${e.tag}`);
  }
  const habs = await db.all('SELECT * FROM habilitaciones');
  for (const h of habs) assert.ok(!/\d{7,8}-[\dkKvV]/.test(String(h.certificado)), 'RUT en certificado');
});

test('Criterio 20: datos de demo ficticios (usuarios y nombres)', async () => {
  const users = await db.all('SELECT username, nombre FROM users');
  const demo = new Set(['admin', 'inspector', 'supervisor', 'brigadista']);
  assert.ok(users.every((u) => demo.has(u.username)));
  assert.ok(users.every((u) => /brigada|inspector|seguridad|demo/i.test(u.nombre)), 'nombres genéricos');
  const txt = fs.readFileSync(path.join(__dirname, '..', 'seeds', 'seed.js'), 'utf8');
  assert.ok(!/María|José|Juan|Pérez|González/i.test(txt), 'sin nombres reales en el seed');
});
