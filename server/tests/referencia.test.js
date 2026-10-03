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
