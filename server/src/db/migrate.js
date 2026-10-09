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
  },
  {
    version: '003_integracion_espejo',
    tables: {
      // Cola local del modo espejo (integración a BD del cliente): si el DB destino
      // está caído, el registro no se pierde; reintenta con backoff (src/integration/espejo.js).
      espejo_pendencias: `CREATE TABLE IF NOT EXISTS espejo_pendencias (
        id {AUTOINC},
        origen VARCHAR(64) NOT NULL,
        registro_id VARCHAR(64) NOT NULL DEFAULT '',
        data {TEXT},
        estado VARCHAR(16) NOT NULL DEFAULT 'pending',
        intentos INTEGER NOT NULL DEFAULT 0,
        siguiente_en INTEGER NOT NULL DEFAULT 0,
        error {TEXT},
        enviado_en VARCHAR(32),
        created_at VARCHAR(32) NOT NULL DEFAULT ''
      )`
    }
  },
  {
    // Spec brigada-cliente-local.md §Modelo de datos: dominio NFPA-10 sobre 001-003.
    version: '004_brigada',
    tables: {
      habilitaciones: `CREATE TABLE IF NOT EXISTS habilitaciones (
        id {AUTOINC},
        brigadista_user_id INTEGER NOT NULL,
        tipo_equipo VARCHAR(32) NOT NULL DEFAULT '*',
        vigente_hasta VARCHAR(32) NOT NULL,
        certificado {TEXT},
        activo INTEGER NOT NULL DEFAULT 1,
        created_at VARCHAR(32) NOT NULL DEFAULT ''
      )`,
      // Reglas NFPA por agente (criterio 2: reglas cargadas como DATOS, no hardcodeadas).
      // hidro_anios: 5 para CO2/agua/BC/K, 12 para PQS en cilindro de acero (spec §7).
      nfpa_reglas: `CREATE TABLE IF NOT EXISTS nfpa_reglas (
        agente VARCHAR(16) PRIMARY KEY,
        mensual_dias INTEGER NOT NULL DEFAULT 30,
        recarga_meses INTEGER NOT NULL DEFAULT 12,
        hidro_anios INTEGER NOT NULL DEFAULT 5,
        amarillo_insp_dias INTEGER NOT NULL DEFAULT 7,
        amarillo_largo_dias INTEGER NOT NULL DEFAULT 30,
        nota VARCHAR(255) NOT NULL DEFAULT ''
      )`
    },
    // ALTERs: se aplican una sola vez al registrarse la versión (migrate es transaccional-por-versión).
    alter: [
      'ALTER TABLE extintores ADD COLUMN metadata {TEXT}',
      "ALTER TABLE extintores ADD COLUMN agente VARCHAR(16) NOT NULL DEFAULT ''",
      'ALTER TABLE extintores ADD COLUMN ultima_recarga VARCHAR(32)',
      'ALTER TABLE extintores ADD COLUMN venc_recarga VARCHAR(32)',
      'ALTER TABLE extintores ADD COLUMN ultima_hidro VARCHAR(32)',
      'ALTER TABLE extintores ADD COLUMN venc_hidro VARCHAR(32)',
      'ALTER TABLE checklist_items ADD COLUMN critico INTEGER NOT NULL DEFAULT 0',
      "ALTER TABLE inspecciones ADD COLUMN habilitacion VARCHAR(32) NOT NULL DEFAULT ''",
      'ALTER TABLE inspecciones ADD COLUMN motivo_rechazo {TEXT}'
    ]
  },
  {
    // A1 (fixes seguridad 03/10/2026): must_change_password + estado revocable de cuenta.
    version: '005_users_seguridad',
    tables: {},
    columnas: {
      users: [
        ['must_change_password', 'INTEGER NOT NULL DEFAULT 0'],
        ['status', "VARCHAR(16) NOT NULL DEFAULT 'activo'"]
      ]
    }
  },
  {
    // Importación fiel desde campo (app Android): conserva fecha de captura, inspector
    // original y ancla el vencimiento a la captura. SIN índice único en BD (portabilidad de
    // dialectos): la idempotencia se resuelve a nivel de aplicación por SELECT sobre captura_id.
    version: '006_importacion',
    tables: {
      importaciones: `CREATE TABLE IF NOT EXISTS importaciones (
        id {AUTOINC},
        archivo_hash VARCHAR(64),
        dispositivo VARCHAR(128),
        total INTEGER NOT NULL DEFAULT 0,
        creados INTEGER NOT NULL DEFAULT 0,
        duplicados INTEGER NOT NULL DEFAULT 0,
        errores INTEGER NOT NULL DEFAULT 0,
        detalle {TEXT},
        ts VARCHAR(32) NOT NULL DEFAULT ''
      )`
    },
    columnas: {
      inspecciones: [
        ['captura_id', 'VARCHAR(64)'],
        ['origen', "VARCHAR(16) NOT NULL DEFAULT 'local'"]
      ]
    }
  },
];

async function migrate() {
  const driver = await db.init();
  const dialect = driver.dialect;
  await db.exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(64) PRIMARY KEY, applied_at VARCHAR(32) NOT NULL)');
  for (const m of MIGRATIONS) {
    const done = await db.get('SELECT version FROM schema_migrations WHERE version = ?', [m.version]);
    if (done) continue;
    for (const sql of Object.values(m.tables || {})) {
      await db.exec(d(dialect, sql));
    }
    // A1 (fixes 03/10/2026): columnas nuevas idempotentes sobre tablas ya creadas.
    for (const [tabla, cols] of Object.entries(m.columnas || {})) {
      for (const [col, ddl] of cols) {
        try { await db.exec(`ALTER TABLE ${tabla} ADD COLUMN ${col} ${ddl}`); }
        catch (e) {
          const msg = String((e && e.message) || '').toLowerCase();
          if (!(msg.includes('duplicate') || msg.includes('already exists'))) throw e;
        }
      }
    }
    for (const sql of (m.alter || [])) {
      try { await db.exec(d(dialect, sql)); }
      catch (e) { console.log(`[${new Date().toISOString()}] [db] ${m.version}: ALTER omitido (${e.message})`); }
    }
    await db.run('INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)', [m.version, new Date().toISOString()]);
    console.log(`[${new Date().toISOString()}] [db] migración aplicada: ${m.version}`);
  }
}

module.exports = { migrate, MIGRATIONS };
