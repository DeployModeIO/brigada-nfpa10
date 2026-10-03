'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { makeConnector, maskUrl } = require('../src/integration/conectores');

test('sqlserver y oracle: 501 conector pendiente', async () => {
  for (const d of ['sqlserver', 'oracle']) {
    await assert.rejects(() => makeConnector(d, 'x'), (e) => e.statusCode === 501, d);
  }
});

test('driver inválido: 400 claro', async () => {
  await assert.rejects(() => makeConnector('db2', 'x'), (e) => e.statusCode === 400);
});

test('sqlite espejo (readonly:false): INSERT vía dispatch DML', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-test-'));
  const file = path.join(tmp, 'destino.sqlite');
  const BS = require('better-sqlite3');
  const w = new BS(file);
  w.exec('CREATE TABLE reg (t TEXT, n INTEGER)');
  w.close();
  const conn = await makeConnector('sqlite', file, { readonly: false });
  await conn.query('INSERT INTO reg (t, n) VALUES (?, ?)', ['EXT-1', 7]);
  const rows = await conn.query('SELECT * FROM reg');
  assert.deepEqual(rows, [{ t: 'EXT-1', n: 7 }]);
  assert.deepEqual(await conn.listTables(), ['reg']);
  await conn.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('sqlite referencia (readonly default) rechaza escritura', async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'conn-test2-'));
  const file = path.join(tmp, 'ref.sqlite');
  const BS = require('better-sqlite3');
  const w = new BS(file);
  w.exec('CREATE TABLE t (x INTEGER)');
  w.close();
  const conn = await makeConnector('sqlite', file);
  await assert.rejects(() => conn.query('INSERT INTO t (x) VALUES (1)'));
  await conn.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('maskUrl oculta la contraseña', () => {
  assert.equal(maskUrl('postgres://user:SECRETO@h:5432/db'), 'postgres://user:****@h:5432/db');
});
