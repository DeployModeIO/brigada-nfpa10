'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('../src/config');
const { buildSql, buildSqlFilas } = require('../src/integration/referencia');

test('buildSql: ids válidos generan SELECT con LIMIT', () => {
  const sql = buildSql({ table: 'dbo.equipos', id: 'cod_equipo', label: 'descripcion', where: 'activo=1', limit: 10 });
  assert.equal(sql, 'SELECT cod_equipo AS id, descripcion AS label FROM dbo.equipos WHERE activo=1 LIMIT 10');
});

test('buildSql/buildSqlFilas: rechazan inyección por identificadores', () => {
  assert.equal(buildSql({ table: 'x; DROP TABLE y', id: 'a', label: 'b' }), null);
  assert.equal(buildSql({ table: 'x', id: 'a b', label: 'b' }), null);
  assert.equal(buildSqlFilas({ table: 'x', id: 'a', label: 'b', where: '1=1; DELETE FROM z' }), null);
  const full = buildSqlFilas({ table: 'equipos_contraincendio', id: 'cod', label: 'desc' });
  assert.match(full, /^SELECT \* FROM equipos_contraincendio LIMIT 2000$/);
});

test('listasConfig ignora definiciones malformadas', () => {
  const prev = config.integrationRefLists;
  config.integrationRefLists = JSON.stringify({ ok: { table: 't', id: 'i', label: 'l' }, sinLabel: { table: 't', id: 'i' }, nulo: null });
  const { listasConfig } = require('../src/integration/referencia');
  assert.deepEqual(Object.keys(listasConfig()), ['ok']);
  config.integrationRefLists = prev;
});
