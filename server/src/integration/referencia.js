'use strict';
// MODO REFERENCIA (PRODUCT-LINE.md §NORMA 3a): lectura de tablas maestras del cliente
// (personal, equipos, áreas) para poblar selectores del producto. NUNCA escribe en el DB
// del cliente en este modo. Las definiciones de listas viven en INTEGRATION_REF_LISTS
// (JSON por entorno) para que ninguna consulta del cliente quede en el código.
// Extensión brigada (spec §Integración): `leerFilas` devuelve la fila COMPLETA para la
// alta masiva de extintores desde el inventario maestro del cliente (POST importar).
//
// FIX A4 (03/10/2026): el WHERE del config ya NO se concatena crudo. Formato canónico:
// array de predicados {"col","op","val"} bind-parametrizados; el string legado se migra
// en un parser de solo lectura y, si no es migrable, se IGNORA con aviso de deprecación.
const config = require('../config');
const { makeConnector } = require('./conectores');
const { interpola } = require('./params');

const CACHE_TTL_MS = parseInt(process.env.INTEGRATION_REF_TTL_MS || '300000', 10);
const MAX_ROWS = 2000;
const cache = new Map(); // nombre -> {rows, ts}

const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$.]*$/;
const OP_CANON = { '=': '=', '!=': '!=', '<>': '<>', '>': '>', '>=': '>=', '<': '<', '<=': '<=', LIKE: 'LIKE', 'NOT LIKE': 'NOT LIKE' };
const LEGADO_RE = /^([A-Za-z_][A-Za-z0-9_$.]*)\s*(=|!=|<>|>=|<=|>|<|LIKE|NOT\s+LIKE)\s*(.+)$/i;

function listasConfig() {
  let raw = {};
  try { raw = JSON.parse(config.integrationRefLists || '{}'); } catch (_) { return {}; }
  const out = {};
  for (const [nombre, def] of Object.entries(raw)) {
    if (!def || typeof def !== 'object') continue;
    if (typeof def.table !== 'string' || typeof def.id !== 'string' || typeof def.label !== 'string') continue;
    out[nombre] = {
      table: def.table, id: def.id, label: def.label,
      where: Array.isArray(def.where) ? def.where : (typeof def.where === 'string' ? def.where : null),
      limit: def.limit
    };
  }
  return out;
}

function migrarWhereLegado(s) {
  if (typeof s !== 'string' || !s.trim()) return [];
  if (/[();|]/.test(s) || /\bOR\b/i.test(s)) return null;
  const preds = [];
  for (const parte of s.split(/\s+AND\s+/i)) {
    const m = LEGADO_RE.exec(parte.trim());
    if (!m) return null;
    let val = m[3].trim();
    if (/^'.*'$/.test(val) && val.length >= 2) val = val.slice(1, -1).replace(/''/g, "'");
    else if (/^-?\d+(\.\d+)?$/.test(val)) val = Number(val);
    else return null;
    preds.push({ col: m[1], op: m[2].toUpperCase().replace(/\s+/g, ' '), val });
  }
  return preds.length ? preds : null;
}

function normalizarPreds(def) {
  let w = def.where;
  let deprecado = false;
  if (typeof w === 'string') {
    const mig = migrarWhereLegado(w);
    if (mig === null) {
      console.warn(`[referencia] DEPRECADO/A4: where string no migrable para la tabla "${def.table}" fue IGNORADO. Use formato estructurado [{"col","op","val"}].`);
      return { preds: [], deprecado: true };
    }
    w = mig;
    deprecado = true;
  }
  if (w === null || w === undefined) return { preds: [], deprecado: false };
  if (!Array.isArray(w)) return null;
  const preds = [];
  for (const p of w) {
    if (!p || typeof p !== 'object') return null;
    if (typeof p.col !== 'string' || !IDENT_RE.test(p.col)) return null;
    const op = OP_CANON[String(p.op || '=').toUpperCase().replace(/\s+/g, ' ')];
    if (!op) return null;
    const val = p.val;
    if (val !== null && typeof val !== 'string' && typeof val !== 'number' && typeof val !== 'boolean') return null;
    preds.push({ col: p.col, op, val });
  }
  return { preds, deprecado };
}

// (FROM ... WHERE ...) parametrizado: { from, params } o null si la definición es insegura.
function baseSql(def) {
  for (const v of [def.table, def.id, def.label]) {
    if (!IDENT_RE.test(v)) return null;
  }
  const norm = normalizarPreds(def);
  if (!norm) return null;
  const params = [];
  let sql = ` FROM ${def.table}`;
  if (norm.preds.length) {
    sql += ' WHERE ' + norm.preds.map((p) => {
      params.push(typeof p.val === 'boolean' ? (p.val ? 1 : 0) : p.val);
      return `${p.col} ${p.op} ?`;
    }).join(' AND ');
  }
  return { from: sql, params };
}

function limitClause(def) {
  return ` LIMIT ${Math.min(Number(def.limit) || MAX_ROWS, MAX_ROWS)}`;
}

// Devuelve { sql, params } (A4: WHERE bind-parametrizado). FIX PG 04/10: `dialect` →
// postgres $1..$n vía helper común src/integration/params.js; sqlite/mysql conservan `?`.
function buildSql(def, dialect) {
  const b = baseSql(def);
  if (!b) return null;
  const sql = `SELECT ${def.id} AS id, ${def.label} AS label${b.from}${limitClause(def)}`;
  return { sql: interpola(sql, dialect), params: b.params };
}

function buildSqlFilas(def, dialect) {
  const b = baseSql(def);
  if (!b) return null;
  return { sql: interpola(`SELECT *${b.from}${limitClause(def)}`, dialect), params: b.params };
}

function isOn() { return config.integrationMode === 'referencia' && !!config.clientDbUrl; }

async function leerLista(nombre) {
  const defs = listasConfig();
  const def = defs[nombre];
  if (!def) return null;
  const hit = cache.get(nombre);
  if (hit && Date.now() - hit.ts < CACHE_TTL_MS) return hit.rows;
  const conn = await makeConnector(config.clientDbDriver, config.clientDbUrl);
  try {
    // FIX PG: el SQL se construye CONOCIENDO el dialecto del conector (postgres → $1..$n).
    const q = buildSql(def, conn.dialect);
    if (!q) { const e = new Error(`definición inválida para la lista "${nombre}" (identificadores SQL no permitidos)`); e.statusCode = 400; throw e; }
    const rows = (await conn.query(q.sql, q.params)).map((r) => ({ id: String(r.id ?? ''), label: String(r.label ?? '') })).filter((r) => r.id);
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
  const conn = await makeConnector(config.clientDbDriver, config.clientDbUrl);
  try {
    // FIX PG: dialecto del conector para $1..$n (postgres); sqlite/mysql mantienen `?`.
    const q = buildSqlFilas(def, conn.dialect);
    if (!q) { const e = new Error(`definición inválida para la lista "${nombre}" (identificadores SQL no permitidos)`); e.statusCode = 400; throw e; }
    return await conn.query(q.sql, q.params);
  } finally {
    await conn.close().catch(() => {});
  }
}

function limpiarCache() { cache.clear(); }

module.exports = { isOn, leerLista, leerFilas, listasConfig, limpiarCache, buildSql, buildSqlFilas, migrarWhereLegado, normalizarPreds };
