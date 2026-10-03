'use strict';
// Capa de adaptador multi-BD. Expone una API asíncrona única, con placeholders "?".
// Drivers: sqlite.js | postgres.js | mysql.js, elegidos por DB_DRIVER + DB_URL.
const config = require('../config');

const DRIVERS = { sqlite: './sqlite', postgres: './postgres', mysql: './mysql' };
let driver = null;

function pickDriver() {
  // Literales estáticos (no require(mod)): permite empaquetar con pkg sin dynamic-require.
  const name = config.dbDriver;
  if (name === 'sqlite') return require('./sqlite');
  if (name === 'postgres') return require('./postgres');
  if (name === 'mysql') return require('./mysql');
  throw new Error(`DB_DRIVER inválido: "${name}" (usa sqlite|postgres|mysql)`);
}

// better-sqlite3 rechaza undefined como parámetro; se normaliza a null.
function normParams(params) {
  return (params || []).map((p) => (p === undefined ? null : p));
}

async function init() {
  if (!driver) {
    driver = pickDriver();
    await driver.init(config.dbUrl);
    console.log(`[${new Date().toISOString()}] [db] driver=${driver.dialect} conectado`);
  }
  return driver;
}

async function use() {
  if (!driver) await init();
  return driver;
}

// query: SELECT -> filas; otro DML -> {changes,lastInsertRowid}
async function query(sql, params) { return (await use()).query(sql, normParams(params)); }
async function all(sql, params) { return (await use()).all(sql, normParams(params)); }
async function get(sql, params) { return (await use()).get(sql, normParams(params)); }
async function run(sql, params) { return (await use()).run(sql, normParams(params)); }
async function exec(sql) { return (await use()).exec(sql); }
async function transaction(fn) { return (await use()).transaction(fn); }
async function close() { if (driver) { await driver.close(); driver = null; } }

module.exports = { init, query, all, get, run, exec, transaction, close, get dialect() { return driver ? driver.dialect : config.dbDriver; } };
