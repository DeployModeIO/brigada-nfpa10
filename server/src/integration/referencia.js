'use strict';
// MODO REFERENCIA (PRODUCT-LINE.md §NORMA 3a): lectura de tablas maestras del cliente
// (personal, equipos, áreas) para poblar selectores del producto. NUNCA escribe en el DB
// del cliente en este modo. Las definiciones de listas viven en INTEGRATION_REF_LISTS
// (JSON por entorno) para que ninguna consulta del cliente quede en el código.
// Extensión brigada (spec §Integración): `leerFilas` devuelve la fila COMPLETA para la
// alta masiva de extintores desde el inventario maestro del cliente (POST importar).
const config = require('../config');
const { makeConnector } = require('./conectores');

const CACHE_TTL_MS = parseInt(process.env.INTEGRATION_REF_TTL_MS || '300000', 10);
const MAX_ROWS = 2000;
const cache = new Map(); // nombre -> {rows, ts}

function listasConfig() {
  let raw = {};
  try { raw = JSON.parse(config.integrationRefLists || '{}'); } catch (_) { return {}; }
  const out = {};
  for (const [nombre, def] of Object.entries(raw)) {
    if (!def || typeof def !== 'object') continue;
    if (typeof def.table !== 'string' || typeof def.id !== 'string' || typeof def.label !== 'string') continue;
    out[nombre] = {
      table: def.table, id: def.id, label: def.label,
      where: typeof def.where === 'string' ? def.where : '',
      limit: def.limit
    };
  }
  return out;
}

// Identificadores SQL del cliente: solo letra/dígito/_/. y sin espacios (evita inyección
// vía config; el config lo pone el administrador de la instalación, no el usuario final).
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$.]*$/;
const WHERE_RE = /^[A-Za-z0-9_$.,=<>!\s'"()\-]*$/;

function baseSql(def) {
  for (const v of [def.table, def.id, def.label]) {
    if (!IDENT_RE.test(v)) return null;
  }
  let sql = `FROM ${def.table}`;
  if (def.where) {
    if (!WHERE_RE.test(def.where)) return null;
    sql += ` WHERE ${def.where}`;
  }
  return { select: `SELECT ${def.id} AS id, ${def.label} AS label ${sql}`, from: sql };
}

function buildSql(def) {
  const b = baseSql(def);
  if (!b) return null;
  return b.select + ` LIMIT ${Math.min(Number(def.limit) || MAX_ROWS, MAX_ROWS)}`;
}

function buildSqlFilas(def) {
  const b = baseSql(def);
  if (!b) return null;
  return `SELECT * ${b.from} LIMIT ${Math.min(Number(def.limit) || MAX_ROWS, MAX_ROWS)}`;
}

function isOn() { return config.integrationMode === 'referencia' && !!config.clientDbUrl; }

// rows: [{id, label}] — cache por TTL; error = lo propaga el caller (503 en la ruta).
async function leerLista(nombre) {
  const defs = listasConfig();
  const def = defs[nombre];
  if (!def) return null;
  const hit = cache.get(nombre);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.rows;
  const sql = buildSql(def);
  if (!sql) { const e = new Error(`definición inválida para la lista "${nombre}" (identificadores SQL no permitidos)`); e.statusCode = 400; throw e; }
  const conn = await makeConnector(config.clientDbDriver, config.clientDbUrl);
  try {
    const rows = (await conn.query(sql)).map((r) => ({ id: String(r.id ?? ''), label: String(r.label ?? '') })).filter((r) => r.id);
    cache.set(nombre, { rows, ts: Date.now() });
    return rows;
  } finally {
    await conn.close().catch(() => {});
  }
}

// Fila cruda del cliente (para importar): sin cache (una lectura por operación admin).
async function leerFilas(nombre) {
  const def = listasConfig()[nombre];
  if (!def) return null;
  const sql = buildSqlFilas(def);
  if (!sql) { const e = new Error(`definición inválida para la lista "${nombre}" (identificadores SQL no permitidos)`); e.statusCode = 400; throw e; }
  const conn = await makeConnector(config.clientDbDriver, config.clientDbUrl);
  try {
    return await conn.query(sql);
  } finally {
    await conn.close().catch(() => {});
  }
}

function limpiarCache() { cache.clear(); }

module.exports = { isOn, leerLista, leerFilas, listasConfig, limpiarCache, buildSql, buildSqlFilas };
