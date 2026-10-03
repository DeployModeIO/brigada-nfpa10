'use strict';
const fs = require('fs');
const path = require('path');

function loadLib() {
  try {
    return require('better-sqlite3');
  } catch (_) {
    throw new Error('Falta el driver "better-sqlite3". Instala dependencias con: npm install');
  }
}

let db = null;
let txChain = Promise.resolve(); // serializa transacciones (sqlite es de un solo writer)

async function init(connStr) {
  fs.mkdirSync(path.dirname(connStr), { recursive: true });
  const Lib = loadLib();
  db = new Lib(connStr);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  return api;
}

function rows(sql, params) { return db.prepare(sql).all(params); }

const api = {
  dialect: 'sqlite',
  init,
  close: async () => { if (db) db.close(); },
  exec: async (sql) => { db.exec(sql); },
  all: async (sql, params = []) => rows(sql, params),
  get: async (sql, params = []) => db.prepare(sql).get(params) ?? null,
  run: async (sql, params = []) => {
    const r = db.prepare(sql).run(params);
    return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) };
  },
  query: async (sql, params = []) => {
    if (/^\s*(select|pragma|with)\b/i.test(sql)) return rows(sql, params);
    const r = db.prepare(sql).run(params);
    return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid) };
  },
  // fn async recibe el mismo api; la cola garantiza que no se solapen dos BEGIN.
  transaction: async (fn) => {
    const run = txChain.then(async () => {
      db.exec('BEGIN IMMEDIATE');
      try {
        const out = await fn(api);
        db.exec('COMMIT');
        return out;
      } catch (e) {
        try { db.exec('ROLLBACK'); } catch (_) { /* ya rollback */ }
        throw e;
      }
    });
    txChain = run.catch(() => {});
    return run;
  }
};

module.exports = api;
