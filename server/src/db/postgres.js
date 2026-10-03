'use strict';
let pool = null;

function loadLib() {
  try {
    return require('pg');
  } catch (_) {
    throw new Error('Falta el driver "pg" para DB_DRIVER=postgres. Instala con: npm install pg');
  }
}

// Convierte placeholders "?" (convención común) a "$1..$n" de postgres.
function toPgSql(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

async function init(connStr) {
  const { Pool } = loadLib();
  pool = new Pool({ connectionString: connStr });
  return api;
}

function wrap(client) {
  return {
    all: async (sql, params = []) => (await client.query(toPgSql(sql), params)).rows,
    get: async (sql, params = []) => ((await client.query(toPgSql(sql), params)).rows || [])[0] ?? null,
    run: async (sql, params = []) => {
      const r = await client.query(toPgSql(sql), params);
      return { changes: r.rowCount ?? 0, lastInsertRowid: r.rows && r.rows[0] ? r.rows[0].id ?? 0 : 0 };
    },
    query: async (sql, params = []) => {
      if (/^\s*(select|with)\b/i.test(sql)) return (await client.query(toPgSql(sql), params)).rows;
      const r = await client.query(toPgSql(sql), params);
      return { changes: r.rowCount ?? 0, lastInsertRowid: 0 };
    },
    exec: async (sql) => { await client.query(sql); }
  };
}

const api = {
  dialect: 'postgres',
  init,
  close: async () => { if (pool) await pool.end(); },
  all: (sql, params) => wrap(pool).all(sql, params),
  get: (sql, params) => wrap(pool).get(sql, params),
  run: (sql, params) => wrap(pool).run(sql, params),
  query: (sql, params) => wrap(pool).query(sql, params),
  exec: (sql) => wrap(pool).exec(sql),
  transaction: async (fn) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const out = await fn(wrap(client));
      await client.query('COMMIT');
      return out;
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }
};

module.exports = api;
