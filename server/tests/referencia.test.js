'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { buildSql, buildSqlFilas } = require('../src/integration/referencia');

test('A4 buildSql: predicado estructurado {col,op,val} viaja bind-parametrizado', () => {
  const q = buildSql({ table: 'dbo.equipos', id: 'cod_equipo', label: 'descripcion', where: [{ col: 'activo', op: '=', val: 1 }], limit: 10 });
  assert.equal(q.sql, 'SELECT cod_equipo AS id, descripcion AS label FROM dbo.equipos WHERE activo = ? LIMIT 10');
  assert.deepEqual(q.params, [1]);
});

test('A4 buildSql: where string legado se MIGRA a placeholders (compatibilidad, solo lectura)', () => {
  const q = buildSql({ table: 't', id: 'a', label: 'b', where: "activo=1 AND tipo='Bomba'" });
  assert.equal(q.sql, 'SELECT a AS id, b AS label FROM t WHERE activo = ? AND tipo = ? LIMIT 2000');
  assert.deepEqual(q.params, [1, 'Bomba']);
});

test('A4 buildSql: inyección por predicados estructurados se rechaza (null)', () => {
  assert.equal(buildSql({ table: 't', id: 'a', label: 'b', where: [{ col: 'activo; DROP TABLE x', op: '=', val: 1 }] }), null);
  assert.equal(buildSql({ table: 't', id: 'a', label: 'b', where: [{ col: 'activo', op: '= 1 OR 1=1 --', val: 1 }] }), null);
});

test('buildSql/buildSqlFilas: rechazan inyección por identificadores', () => {
  assert.equal(buildSql({ table: 'x; DROP TABLE y', id: 'a', label: 'b' }), null);
  assert.equal(buildSql({ table: 'x', id: 'a b', label: 'b' }), null);
  // A4: un WHERE no migrable (subquery/; ) NO se concatena: se descarta con aviso (no null duro)
  const inseguro = buildSqlFilas({ table: 'x', id: 'a', label: 'b', where: '1=1; DELETE FROM z' });
  assert.equal(inseguro.params.length, 0);
  assert.ok(!/DELETE|;/.test(inseguro.sql), 'el SQL final no contiene el fragmento inyectado');
  const full = buildSqlFilas({ table: 'equipos_contraincendio', id: 'cod', label: 'desc' });
  assert.match(full.sql, /^SELECT \* FROM equipos_contraincendio LIMIT 2000$/);
});

test('listasConfig ignora definiciones malformadas', () => {
  const prev = config.integrationRefLists;
  config.integrationRefLists = JSON.stringify({ ok: { table: 't', id: 'i', label: 'l' }, sinLabel: { table: 't', id: 'i' }, nulo: null });
  const { listasConfig } = require('../src/integration/referencia');
  assert.deepEqual(Object.keys(listasConfig()), ['ok']);
  config.integrationRefLists = prev;
});

// ─── FIX PG 04/10/2026 (evidencia erp-referencia.log [4b]) ───────────────────
// buildSql/buildSqlFilas generaban `?` incluso para Postgres (que exige $1..$n) ⇒
// cualquier lista de referencia con `where` sobre PG respondía 500. El helper común
// src/integration/params.js (factorizado de espejo.js) ahora ajusta por dialecto.
const fs = require('fs');
const os = require('os');
const path = require('path');
const Lib = require('better-sqlite3');
const { interpola } = require('../src/integration/params');
const { leerLista, leerFilas, limpiarCache } = require('../src/integration/referencia');

test('regresión: buildSql/buildSqlFilas sin dialecto siguen emitiendo ?', () => {
  const d = { table: 't', id: 'a', label: 'b', where: [{ col: 'activo', op: '=', val: 1 }, { col: 'tipo', op: 'LIKE', val: '%Bomba%' }] };
  assert.match(buildSql(d).sql, /activo = \? AND tipo LIKE \? LIMIT 2000$/);
  assert.match(buildSqlFilas(d).sql, /^SELECT \* FROM t WHERE activo = \? AND tipo LIKE \? LIMIT 2000$/);
});

test('FIX: postgres → $1..$n en buildSql y buildSqlFilas (params en orden, sin ?)', () => {
  const d = { table: 't', id: 'a', label: 'b', where: [{ col: 'activo', op: '=', val: 1 }, { col: 'tipo', op: '<>', val: 'externo' }], limit: 7 };
  const q = buildSql(d, 'postgres');
  assert.equal(q.sql, 'SELECT a AS id, b AS label FROM t WHERE activo = $1 AND tipo <> $2 LIMIT 7');
  assert.deepEqual(q.params, [1, 'externo']);
  const f = buildSqlFilas(d, 'postgres');
  assert.equal(f.sql, 'SELECT * FROM t WHERE activo = $1 AND tipo <> $2 LIMIT 7');
  assert.ok(!f.sql.includes('?'));
});

test('params.js interpola: solo postgres convierte', () => {
  assert.equal(interpola('x = ? AND y = ?', 'postgres'), 'x = $1 AND y = $2');
  assert.equal(interpola('x = ?', 'sqlite'), 'x = ?');
  assert.equal(interpola('x = ?', undefined), 'x = ?');
});

test('E2E fixture sqlite: leerLista y leerFilas con where bind (regresión sqlite intacta)', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-fixture-'));
  const file = path.join(tmp, 'cliente.db');
  const cli = new Lib(file);
  cli.exec('CREATE TABLE inventario (tag TEXT, ubicacion TEXT, activo INTEGER)');
  const ins = cli.prepare('INSERT INTO inventario (tag, ubicacion, activo) VALUES (?, ?, ?)');
  ins.run('EXT-1', 'Sala calderas', 1);
  ins.run('EXT-2', 'Subestación', 1);
  ins.run('EXT-3', 'Bodega', 0);
  cli.close();
  const prev = { driver: config.clientDbDriver, url: config.clientDbUrl, lists: config.integrationRefLists };
  Object.assign(config, {
    integrationMode: 'referencia', clientDbDriver: 'sqlite', clientDbUrl: file,
    integrationRefLists: JSON.stringify({
      inventario_extintor: { table: 'inventario', id: 'tag', label: 'ubicacion', where: [{ col: 'activo', op: '=', val: 1 }] }
    })
  });
  try {
    limpiarCache();
    const rows = await leerLista('inventario_extintor');
    assert.deepEqual(rows.map((r) => r.id).sort(), ['EXT-1', 'EXT-2']);
    const full = await leerFilas('inventario_extintor');
    assert.equal(full.length, 2, 'leerFilas aplica el mismo bind con dialecto del conector');
    assert.equal(full[0].tag, 'EXT-1');
  } finally {
    Object.assign(config, { clientDbDriver: prev.driver, clientDbUrl: prev.url, integrationRefLists: prev.lists });
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
