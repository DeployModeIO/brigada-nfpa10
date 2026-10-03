'use strict';
// Rutas de integración a la base de datos del cliente (PRODUCT-LINE.md §NORMA 3).
// SEGURIDAD: las credenciales del DB del cliente SOLO viven en variables de entorno del
// server. El test de conexión las recibe por POST una sola vez, prueba, responde y las
// OLVIDA: nunca se guardan en settings ni se devuelven al client en claro.
// Extensión brigada (spec brigada-cliente-local §Integración): POST /ref/:nombre/importar
// hace ALTA MASIVA de extintores desde el inventario maestro del cliente con mapeo
// configurable por ENV (INTEGRATION_IMPORT_MAP); nunca doble digitar.
const express = require('express');
const config = require('../config');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { bad, cleanStr, toNum, validDate, TAG_RE } = require('../middleware/validate');
const { testConnection, maskUrl } = require('../integration/conectores');
const referencia = require('../integration/referencia');
const espejo = require('../integration/espejo');

const router = express.Router();

const VALIDADORES = ['sqlite', 'postgres', 'mysql', 'sqlserver', 'oracle'];

// Columnas destino de extintores que la importación puede escribir.
const IMPORT_COLS = ['tag', 'ubicacion', 'tipo', 'agente', 'capacidad_l', 'fecha_fabricacion', 'lat', 'lng', 'notas'];
const IMPORT_MAP_DEFAULT = {
  cod_equipo: 'tag', codigo: 'tag', tag: 'tag',
  descripcion: 'notas', area: 'ubicacion', ubicacion: 'ubicacion',
  agente: 'agente', tipo: 'tipo',
  capacidad_kg: 'capacidad_l', capacidad: 'capacidad_l',
  fecha_fabricacion: 'fecha_fabricacion'
};

function importMap() {
  let raw = {};
  try { raw = JSON.parse(config.integrationImportMap || '{}'); } catch (_) { raw = {}; }
  const map = { ...IMPORT_MAP_DEFAULT };
  for (const [src, dst] of Object.entries(raw)) {
    if (typeof src === 'string' && typeof dst === 'string' && IMPORT_COLS.includes(dst)) map[src] = dst;
  }
  return map;
}

router.get('/integration/status', auth, requireRole('admin'), async (req, res, next) => {
  try {
    res.json({
      mode: config.integrationMode,
      selfDriver: config.dbDriver,
      clientDb: {
        driver: config.clientDbDriver,
        url: config.clientDbUrl ? maskUrl(config.clientDbUrl) : null,
        configurado: !!config.clientDbUrl
      },
      referencia: {
        activo: referencia.isOn(),
        listas: Object.keys(referencia.listasConfig())
      },
      espejo: {
        activo: espejo.isOn(),
        mapeos: await espejo.getMapeos(),
        pendientes: await espejo.pendientes()
      },
      pendientesNota: 'sqlserver|oracle: conectores pendientes (contribuya) — ver PRODUCT-LINE.md §Deuda conocida'
    });
  } catch (e) { next(e); }
});

// Herramienta de TEST de conexión del admin: probar credenciales + listar tablas.
// Respuesta transitoria: el server no persiste NADA de lo enviado aquí.
router.post('/integration/test', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { driver, url } = req.body || {};
    if (!VALIDADORES.includes(String(driver))) return bad(res, `driver debe ser uno de: ${VALIDADORES.join('|')}`);
    if (typeof url !== 'string' || !url.trim()) return bad(res, 'url de conexión requerida (ej: postgres://usuario:clave@host:5432/base)');
    if (driver === 'sqlserver' || driver === 'oracle') {
      return res.status(501).json({
        error: 'connector_pending',
        msg: `conector ${driver}: pendiente de implementación (contribuya) — muchos clientes mineros lo necesitan; ver PRODUCT-LINE.md §Deuda conocida`
      });
    }
    const r = await testConnection({ driver, url: url.trim() });
    res.json(r);
  } catch (e) {
    if (e.statusCode === 501) return res.status(501).json({ error: 'connector_pending', msg: e.message });
    res.status(502).json({ error: 'connection_failed', msg: `No se pudo conectar: ${e.message}` });
  }
});

router.get('/integration/ref', auth, async (req, res, next) => {
  try {
    if (!referencia.isOn()) return res.status(400).json({ error: 'integration_off', msg: 'INTEGRATION_MODE=referencia no está activo en este server' });
    res.json({ listas: Object.keys(referencia.listasConfig()) });
  } catch (e) { next(e); }
});

// Selectores poblados desde tablas del cliente: GET /integration/ref/personal
router.get('/integration/ref/:nombre', auth, async (req, res, next) => {
  try {
    if (!referencia.isOn()) return res.status(400).json({ error: 'integration_off', msg: 'modo referencia no activo' });
    const nombre = String(req.params.nombre || '').slice(0, 40);
    const filas = await referencia.leerLista(nombre);
    if (filas === null) return res.status(404).json({ error: 'not_found', msg: `lista "${nombre}" no definida en INTEGRATION_REF_LISTS` });
    res.json({ items: filas, cached: true });
  } catch (e) { next(e); }
});

// ALTA MASIVA desde la referencia del cliente (spec criterio 13): upsert de extintores.
// Mapeo columna-cliente→columna-brigada por ENV INTEGRATION_IMPORT_MAP; columnas cliente
// no mapeadas viajan a metadata (origen:"referencia") para no perder datos del maestro.
router.post('/integration/ref/:nombre/importar', auth, requireRole('admin'), async (req, res, next) => {
  try {
    if (!referencia.isOn()) return res.status(400).json({ error: 'integration_off', msg: 'modo referencia no activo (INTEGRATION_MODE=referencia + CLIENT_DB_URL)' });
    const nombre = String(req.params.nombre || '').slice(0, 40);
    const filas = await referencia.leerFilas(nombre);
    if (filas === null) return res.status(404).json({ error: 'not_found', msg: `lista "${nombre}" no definida en INTEGRATION_REF_LISTS` });
    const map = importMap();
    const ahora = new Date().toISOString();
    let creados = 0, actualizados = 0, saltados = 0;
    const errores = [];
    for (const fila of filas) {
      const destino = {};
      const extras = {};
      for (const [col, val] of Object.entries(fila)) {
        const dst = map[col];
        if (dst) destino[dst] = val;
        else extras[col] = val;
      }
      const tag = cleanStr(destino.tag, 32);
      if (!tag || !TAG_RE.test(tag)) { saltados += 1; errores.push(`tag inválido o ausente en fila: ${JSON.stringify(fila).slice(0, 120)}`); continue; }
      const rec = { tag: tag.toUpperCase() };
      if (destino.ubicacion !== undefined) rec.ubicacion = cleanStr(destino.ubicacion, 255) || '';
      if (destino.tipo !== undefined) rec.tipo = cleanStr(destino.tipo, 64) || '';
      if (destino.agente !== undefined) rec.agente = cleanStr(destino.agente, 16)?.toUpperCase() || '';
      if (destino.capacidad_l !== undefined) {
        const n = toNum(destino.capacidad_l);
        if (n !== undefined && n >= 0 && n <= 100000) rec.capacidad_l = n;
      }
      if (destino.fecha_fabricacion !== undefined) {
        const v = validDate(destino.fecha_fabricacion);
        if (v !== undefined) rec.fecha_fabricacion = v;
      }
      for (const f of ['lat', 'lng']) {
        if (destino[f] !== undefined) {
          const n = toNum(destino[f]);
          const lim = f === 'lat' ? 90 : 180;
          if (n !== undefined && n >= -lim && n <= lim) rec[f] = n;
        }
      }
      if (destino.notas !== undefined) rec.notas = cleanStr(destino.notas, 4000);
      rec.metadata = JSON.stringify({ origen: 'referencia', lista: nombre, cruce: extras });

      const exists = await db.get('SELECT tag FROM extintores WHERE tag = ?', [rec.tag]);
      if (exists) {
        const cols = Object.keys(rec).filter((c) => c !== 'tag');
        await db.run(`UPDATE extintores SET ${cols.map((c) => `${c} = ?`).join(', ')}, updated_at = ? WHERE tag = ?`,
          [...cols.map((c) => rec[c]), ahora, rec.tag]);
        actualizados += 1;
      } else {
        await db.run(
          `INSERT INTO extintores (tag, ubicacion, tipo, agente, capacidad_l, fecha_fabricacion, lat, lng, notas, metadata, estado_inspeccion, rechazado, activo, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'n_a', 0, 1, ?, ?)`,
          [rec.tag, rec.ubicacion ?? '', rec.tipo ?? '', rec.agente ?? '', rec.capacidad_l ?? null,
            rec.fecha_fabricacion ?? null, rec.lat ?? null, rec.lng ?? null, rec.notas ?? null,
            rec.metadata, ahora, ahora]
        );
        creados += 1;
      }
    }
    res.json({ ok: true, lista: nombre, leidas: filas.length, creados, actualizados, saltados, errores: errores.slice(0, 10) });
  } catch (e) { next(e); }
});

router.get('/integration/espejo/mapeos', auth, requireRole('admin'), async (req, res, next) => {
  try { res.json({ mapeos: await espejo.getMapeos() }); } catch (e) { next(e); }
});

router.put('/integration/espejo/mapeos', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const arr = (req.body || {}).mapeos;
    await espejo.setMapeos(arr);
    res.json({ mapeos: await espejo.getMapeos() });
  } catch (e) {
    if (e.statusCode === 400) return bad(res, e.message);
    next(e);
  }
});

router.post('/integration/espejo/flush', auth, requireRole('admin'), async (req, res, next) => {
  try {
    if (!espejo.isOn()) return res.status(400).json({ error: 'integration_off', msg: 'modo espejo no activo (INTEGRATION_MODE=espejo + CLIENT_DB_URL)' });
    res.json(await espejo.flush());
  } catch (e) { next(e); }
});

module.exports = router;
