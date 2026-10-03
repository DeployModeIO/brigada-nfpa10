'use strict';
// Cálculo de estado según vencimiento (NFPA 10) y reglas de rechazo.
// El motor completo vive en lib/nfpa.js; aquí se mantiene la API histórica
// (estadoCalculado(e, now)) EXTENDIDA con un tercer argumento opcional `reglas`.
// CRITICAS: fallback cuando la BD aún no marca críticos por fila (spec §Reglas 1:
// los críticos son DATOS de checklist_items.critico, cargados por el seed NFPA).
const { estadoNfpa, parseTs } = require('./nfpa');
const CRITICAS = ['presion_rango', 'manometro_rango', 'precinto_intacto', 'manguera_sin_fisuras'];

function estadoCalculado(e, now = Date.now(), reglas = null) {
  return estadoNfpa(e, reglas, now).estado;
}

function esCritica(clave) { return CRITICAS.includes(clave); }

// Críticos autoritativos desde BD (con caché corto). Si la tabla aún no tiene
// filas con critico=1, cae al fallback estático.
let criticasCache = null;
async function criticasActivas(forzar = false) {
  if (criticasCache && !forzar) return criticasCache;
  try {
    const db = require('../db');
    const rows = await db.all('SELECT clave FROM checklist_items WHERE critico = 1 AND activo = 1');
    if (rows.length) return (criticasCache = new Set(rows.map((r) => r.clave)));
  } catch (_) { /* tabla/columna aún no migrada */ }
  return new Set(CRITICAS);
}

module.exports = { CRITICAS, estadoCalculado, esCritica, criticasActivas, parseTs };
