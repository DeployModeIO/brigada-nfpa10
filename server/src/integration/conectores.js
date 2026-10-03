'use strict';
// Conectores de BAJA NIVEL para la base de datos del CLIENTE FINAL (distintos de los
// adaptadores de src/db, que gestionan el almacén propio del producto). Cada instancia
// abre su propio pool: permite p.ej. app=postgres sobre sqlite del cliente en espejo.
// postgres/mysql/sqlite: REALES. sqlserver/oracle: stub con error claro (deuda conocida).
// Fix de línea (TBT/RCA/Flota → brigada): sqlite se abre readonly por defecto; el modo
// ESPEJO pasa {readonly:false} y query() hace dispatch SELECT vs DML (better-sqlite3
// lanza "This statement does not return data" si se usa .all() sobre un INSERT).
const config = require('../config');

function loadOptional(mod, driver) {
  try { return require(mod); } catch (_) {
    throw new Error(`Falta el driver "${mod}" para CLIENT_DB_DRIVER=${driver}. Instale con: npm install ${driver === 'postgres' ? 'pg' : 'mysql2'}`);
  }
}

const DML_RE = /^\s*(INSERT|UPDATE|DELETE|REPLACE|CREATE|DROP|ALTER)\b/i;

// Devuelve api: {dialect, version(), listTables(), query(sql,params), close()}
// opts.readonly: solo aplica a sqlite; referencia=true (default), espejo=false.
async function makeConnector(driver, connStr, opts = {}) {
  const name = String(driver || '').toLowerCase();
  if (name === 'sqlserver' || name === 'oracle') {
    const e = new Error(`CLIENT_DB_DRIVER=${name}: conector pendiente de implementación (contribuya — vea PRODUCT-LINE.md §Deuda conocida)`);
    e.statusCode = 501;
    throw e;
  }
  if (name === 'sqlite') {
    const Lib = loadOptional('better-sqlite3', 'sqlite');
    const readonly = opts.readonly !== false;
    const db = new Lib(connStr, readonly ? { readonly: true } : {});
    return {
      dialect: 'sqlite',
      version: async () => ({ product: 'sqlite', version: db.prepare('SELECT sqlite_version() AS v').get().v }),
      listTables: async () => db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all().map((r) => r.name),
      query: async (sql, params = []) => {
        if (DML_RE.test(sql)) return db.prepare(sql).run(params);
        return db.prepare(sql).all(params);
      },
      close: async () => db.close()
    };
  }
  if (name === 'postgres') {
    const { Pool } = loadOptional('pg', 'postgres');
    const pool = new Pool({ connectionString: connStr, max: 2, connectionTimeoutMillis: 8000 });
    return {
      dialect: 'postgres',
      version: async () => { const r = await pool.query('SHOW server_version'); return { product: 'postgres', version: r.rows[0].server_version }; },
      listTables: async () => (await pool.query(
        "SELECT table_schema||'.'||table_name AS t FROM information_schema.tables WHERE table_schema NOT IN ('pg_catalog','information_schema') ORDER BY 1"
      )).rows.map((r) => r.t),
      query: async (sql, params = []) => (await pool.query(sql, params)).rows,
      close: async () => pool.end()
    };
  }
  if (name === 'mysql') {
    const mysql = loadOptional('mysql2/promise', 'mysql');
    const pool = mysql.createPool({ uri: connStr, connectionLimit: 2, connectTimeout: 8000 });
    return {
      dialect: 'mysql',
      version: async () => { const [r] = await pool.query('SELECT VERSION() AS v'); return { product: 'mysql', version: r[0].v }; },
      listTables: async () => (await pool.query(
        'SELECT CONCAT(table_schema,\'.\',table_name) AS t FROM information_schema.tables WHERE table_schema NOT IN (\'information_schema\',\'mysql\',\'performance_schema\',\'sys\') ORDER BY 1'
      ))[0].map((r) => r.t),
      query: async (sql, params = []) => (await pool.query(sql, params))[0],
      close: async () => pool.end()
    };
  }
  const e = new Error(`CLIENT_DB_DRIVER inválido: "${name}" (usa postgres|mysql|sqlite; sqlserver|oracle pendientes)`);
  e.statusCode = 400;
  throw e;
}

// Prueba de conexión SIN persistir credenciales: conecta, lee versión y lista tablas.
async function testConnection({ driver, url }) {
  const t0 = Date.now();
  const conn = await makeConnector(driver || config.clientDbDriver, url);
  try {
    const v = await conn.version();
    const tables = await conn.listTables();
    return { ok: true, dialect: conn.dialect, ...v, tables, latencyMs: Date.now() - t0 };
  } finally {
    await conn.close().catch(() => {});
  }
}

// Enmascara la contraseña de una URL de conexión para mostrarla en admin.
function maskUrl(u) {
  if (!u) return null;
  try {
    const x = new URL(u);
    if (x.password) x.password = '****';
    return x.toString();
  } catch (_) { return '(url no parseable)'; }
}

module.exports = { makeConnector, testConnection, maskUrl };
