'use strict';
// MODO ESPEJO (PRODUCT-LINE.md §NORMA 3): escritura de registros propios (inspecciones,
// rechazos) a tablas del cliente, VÍA COLA LOCAL — el flujo operativo nunca se bloquea
// si el DB del cliente está caído: la fila queda en espejo_pendencias con retry
// exponencial y el admin ve/reasigna el mapeo.
// Mapeos: JSON en settings clave `espejo.mapeos`:
//   [{"origen":"inspecciones","destino":"faena.reg_inspecciones",
//     "columnas":{"tag":"equipo_tag","created_at":"fecha","inspector_username":"usuario"}}]
// `columnas` mapea campo LOCAL -> columna del CLIENTE. Solo se espejan campos presentes.
const config = require('../config');
const db = require('../db');
const { getSetting, setSetting } = require('../lib/webhook');
const { makeConnector } = require('./conectores');
const { interpola } = require('./params');

const MAPEOS_KEY = 'espejo.mapeos';
const BASE_RETRY_MS = 15_000;
const MAX_RETRY_MS = 30 * 60_000;
const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_$.]*$/;

function isOn() { return config.integrationMode === 'espejo' && !!config.clientDbUrl; }

function validarMapeos(arr) {
  if (!Array.isArray(arr)) return 'espejo.mapeos debe ser un array';
  for (const m of arr) {
    if (!m || typeof m !== 'object') return 'cada mapeo debe ser un objeto';
    if (typeof m.origen !== 'string' || !/^[a-z_]+$/.test(m.origen)) return 'origen: nombre de tabla local (a-z_)';
    if (typeof m.destino !== 'string' || !IDENT_RE.test(m.destino)) return `destino "${m.destino}": identificador SQL inválido`;
    if (!m.columnas || typeof m.columnas !== 'object' || Array.isArray(m.columnas)) return 'columnas: objeto {local: cliente}';
    for (const [k, v] of Object.entries(m.columnas)) {
      if (!IDENT_RE.test(k) || !IDENT_RE.test(v)) return `columnas "${k}→${v}": identificadores SQL inválidos`;
    }
  }
  return null;
}

async function getMapeos() {
  const raw = await getSetting(MAPEOS_KEY);
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch (_) { return []; }
}

async function setMapeos(arr) {
  const err = validarMapeos(arr);
  if (err) { const e = new Error(err); e.statusCode = 400; throw e; }
  await setSetting(MAPEOS_KEY, JSON.stringify(arr));
}

// Encola el registro local recién creado. Fail-silent: si algo falla aquí, la
// inspección YA fue guardada; solo se pierde el intento de espejo (se loguea).
async function enqueue(origen, registro) {
  try {
    const mapeos = await getMapeos();
    if (!mapeos.some((m) => m.origen === origen)) return null;
    const r = await db.run(
      'INSERT INTO espejo_pendencias (origen, registro_id, data, estado, intentos, siguiente_en, created_at) VALUES (?, ?, ?, \'pending\', 0, ?, ?)',
      [origen, String(registro.id ?? ''), JSON.stringify(registro), Date.now(), new Date().toISOString()]
    );
    return r.lastInsertRowid;
  } catch (e) {
    console.log(`[${new Date().toISOString()}] [espejo] enqueue falló (${origen}): ${e.message}`);
    return null;
  }
}

async function flush() {
  const resumen = { enviados: 0, fallidas: 0, pendientes: 0 };
  if (!isOn()) return resumen;
  const now = Date.now();
  const rows = await db.all(
    'SELECT * FROM espejo_pendencias WHERE estado <> \'enviado\' AND siguiente_en <= ? ORDER BY id ASC LIMIT 50', [now]
  );
  if (!rows.length) { resumen.pendientes = Number((await db.get('SELECT COUNT(*) AS c FROM espejo_pendencias WHERE estado <> \'enviado\''))?.c || 0); return resumen; }

  let conn = null;
  let lastErr = null;
  try {
    // readonly:false: el espejo ESCRIBE en el destino (fix de línea, ver conectores.js).
    conn = await makeConnector(config.clientDbDriver, config.clientDbUrl, { readonly: false });
  } catch (e) { lastErr = e.message; }

  for (const p of rows) {
    if (conn) {
      try {
        const mapeos = await getMapeos();
        const m = mapeos.find((x) => x.origen === p.origen);
        if (!m) { await db.run('UPDATE espejo_pendencias SET estado=\'enviado\' WHERE id=?', [p.id]); resumen.enviados += 1; continue; }
        // A4 (fixes 03/10/2026): re-validar IDENT_RE sobre destino/columnas ANTES de
        // construir el SQL — defensa en profundidad si la config se editó fuera de banda.
        const errMapeo = validarMapeos([m]);
        if (errMapeo) throw new Error(`mapeo rechazado por re-validaci\u00f3n: ${errMapeo}`);
        const reg = JSON.parse(p.data || '{}');
        const pares = Object.entries(m.columnas).filter(([local]) => reg[local] !== undefined);
        if (!pares.length) throw new Error('el mapeo no produce columnas');
        const cols = pares.map(([, cliente]) => cliente).join(', ');
        const sql = `INSERT INTO ${m.destino} (${cols}) VALUES (${pares.map(() => '?').join(', ')})`;
        await conn.query(interpola(sql, conn.dialect), pares.map(([local]) => { const v = reg[local]; if (typeof v === 'boolean') return v ? 1 : 0; if (v && typeof v === 'object') return JSON.stringify(v); return v; }));
        await db.run('UPDATE espejo_pendencias SET estado=\'enviado\', enviado_en=?, error=NULL WHERE id=?', [new Date().toISOString(), p.id]);
        resumen.enviados += 1;
        continue;
      } catch (e) { lastErr = e.message; }
    }
    const intentos = Number(p.intentos) + 1;
    await db.run(
      'UPDATE espejo_pendencias SET estado=\'error\', intentos=?, siguiente_en=?, error=? WHERE id=?',
      [intentos, Date.now() + Math.min(BASE_RETRY_MS * 2 ** intentos, MAX_RETRY_MS), String(lastErr || 'conexión no disponible').slice(0, 500), p.id]
    );
    resumen.fallidas += 1;
  }
  if (conn) await conn.close().catch(() => {});
  resumen.pendientes = Number((await db.get('SELECT COUNT(*) AS c FROM espejo_pendencias WHERE estado <> \'enviado\''))?.c || 0);
  return resumen;
}

async function pendientes() {
  const r = await db.get("SELECT COUNT(*) AS c FROM espejo_pendencias WHERE estado <> 'enviado'");
  return Number(r?.c || 0);
}

function startEspejoJob(intervalMs) {
  if (!isOn()) return null;
  const t = setInterval(() => {
    flush().catch((e) => console.log(`[${new Date().toISOString()}] [espejo] job error: ${e.message}`));
  }, intervalMs || config.espejoIntervalMs);
  t.unref();
  console.log(`[${new Date().toISOString()}] [espejo] job activo cada ${intervalMs || config.espejoIntervalMs}ms → ${config.clientDbDriver}`);
  return t;
}

module.exports = { isOn, getMapeos, setMapeos, validarMapeos, enqueue, flush, pendientes, startEspejoJob, MAPEOS_KEY };
