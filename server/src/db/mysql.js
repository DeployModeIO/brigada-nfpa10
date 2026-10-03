'use strict';
let pool = null;

function loadLib() {
  try {
    return require('mysql2/promise');
  } catch (_) {
    throw new Error('Falta el driver "mysql2" para DB_DRIVER=mysql. Instala con: npm install mysql2');
  }
}

async function init(connStr) {
  const mysql = loadLib();
  pool = mysql.createPool({ uri: connStr, dateStrings: true });
  return api;
}

function wrap(conn) {
  return {
    all: async (sql, params = []) => { const [rows] = await conn.query(sql, params); return rows; },
    get: async (sql, params = []) => { const [rows] = await conn.query(sql, params); return rows[0] ?? null; },
    run: async (sql, params = []) => {
      const [r] = await conn.query(sql, params);
      return { changes: r.affectedRows ?? 0, lastInsertRowid: Number(r.insertId ?? 0) };
    },
    query: async (sql, params = []) => {
      if (/^\s*(select|with)\b/i.test(sql)) { const [rows] = await conn.query(sql, params); return rows; }
      const [r] = await conn.query(sql, params);
      return { changes: r.affectedRows ?? 0, lastInsertRowid: Number(r.insertId ?? 0) };
    },
    exec: async (sql) => { await conn.query(sql); }
  };
}

const api = {
  dialect: 'mysql',
  init,
  close: async () => { if (pool) await pool.end(); },
  all: (sql, params) => wrap(pool).all(sql, params),
  get: (sql, params) => wrap(pool).get(sql, params),
  run: (sql, params) => wrap(pool).run(sql, params),
  query: (sql, params) => wrap(pool).query(sql, params),
  exec: (sql) => wrap(pool).exec(sql),
  transaction: async (fn) => {
    const conn = await pool.getConnection();
    try {
      await conn.query('BEGIN');
      const out = await fn(wrap(conn));
      await conn.query('COMMIT');
      return out;
    } catch (e) {
      await conn.query('ROLLBACK');
      throw e;
    } finally {
      conn.release();
    }
  }
};

module.exports = api;
