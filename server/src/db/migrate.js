'use strict';
// Migraciones idempotentes con registro en schema_migrations.
// Un solo plantel de DDL, sustituyendo tokens por sintaxis de cada dialecto.
const db = require('./index');

const TOKENS = {
  AUTOINC: {
    sqlite: 'INTEGER PRIMARY KEY AUTOINCREMENT',
    postgres: 'SERIAL PRIMARY KEY',
    mysql: 'INT AUTO_INCREMENT PRIMARY KEY'
  },
  FLOAT: { sqlite: 'REAL', postgres: 'DOUBLE PRECISION', mysql: 'DOUBLE' },
  TEXT: { sqlite: 'TEXT', postgres: 'TEXT', mysql: 'LONGTEXT' }
};

function d(dialect, tpl) {
  return tpl
    .replace(/\{AUTOINC\}/g, TOKENS.AUTOINC[dialect])
    .replace(/\{FLOAT\}/g, TOKENS.FLOAT[dialect])
    .replace(/\{TEXT\}/g, TOKENS.TEXT[dialect]);
}

const MIGRATIONS = [
  {
    version: '001_core',
    tables: {
      users: `CREATE TABLE IF NOT EXISTS users (
        id {AUTOINC},
        username VARCHAR(64) NOT NULL UNIQUE,
        password_hash VARCHAR(128) NOT NULL,
        nombre VARCHAR(128) NOT NULL DEFAULT '',
        rol VARCHAR(16) NOT NULL DEFAULT 'inspector',
        activo INTEGER NOT NULL DEFAULT 1,
        created_at VARCHAR(32) NOT NULL DEFAULT ''
      )`,
      settings: `CREATE TABLE IF NOT EXISTS settings (
        skey VARCHAR(64) PRIMARY KEY,
        svalue {TEXT}
      )`
    }
  },
  {
    version: '002_extintores_checklist_inspecciones',
    tables: {
      extintores: `CREATE TABLE IF NOT EXISTS extintores (
        tag VARCHAR(32) PRIMARY KEY,
        ubicacion VARCHAR(255) NOT NULL DEFAULT '',
        tipo VARCHAR(64) NOT NULL DEFAULT '',
        capacidad_l {FLOAT},
        presion_bar {FLOAT},
        fecha_fabricacion VARCHAR(32),
        ultima_inspeccion VARCHAR(32),
        proximo_vencimiento VARCHAR(32),
        estado_inspeccion VARCHAR(8) NOT NULL DEFAULT 'n_a',
        rechazado INTEGER NOT NULL DEFAULT 0,
        notas {TEXT},
        lat {FLOAT},
        lng {FLOAT},
        activo INTEGER NOT NULL DEFAULT 1,
        created_at VARCHAR(32) NOT NULL DEFAULT '',
        updated_at VARCHAR(32) NOT NULL DEFAULT ''
      )`,
      checklist_items: `CREATE TABLE IF NOT EXISTS checklist_items (
        id {AUTOINC},
        clave VARCHAR(64) NOT NULL UNIQUE,
        etiqueta VARCHAR(255) NOT NULL,
        orden INTEGER NOT NULL DEFAULT 0,
        activo INTEGER NOT NULL DEFAULT 1
      )`,
      inspecciones: `CREATE TABLE IF NOT EXISTS inspecciones (
        id {AUTOINC},
        tag VARCHAR(32) NOT NULL,
        resultados {TEXT} NOT NULL,
        fallas {TEXT},
        criticas_fallan INTEGER NOT NULL DEFAULT 0,
        observaciones {TEXT},
        foto {TEXT},
        lat {FLOAT},
        lng {FLOAT},
        dispositivo VARCHAR(128),
        inspector_id INTEGER,
        inspector_username VARCHAR(64),
        created_at VARCHAR(32) NOT NULL DEFAULT ''
      )`
    }
  }
];

async function migrate() {
  const driver = await db.init();
  const dialect = driver.dialect;
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) PRIMARY KEY, applied_at VARCHAR(32) NOT NULL)');
  for (const m of MIGRATIONS) {
    const done = await db.get('SELECT version FROM schema_migrations WHERE version = ?', [m.version]);
    if (done) continue;
    for (const sql of Object.values(m.tables)) {
      await db.exec(d(dialect, sql));
    }
    await db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [m.version, new Date().toISOString()]);
    console.log(`[${new Date().toISOString()}] [db] migración aplicada: ${m.version}`);
  }
}

module.exports = { migrate, MIGRATIONS };
