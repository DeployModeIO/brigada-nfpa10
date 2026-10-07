'use strict';
// Motor de vencimientos NFPA 10 + API RP 14G (V2.1 Oil & Gas, DEC BRIGADA-O&G).
// estado = min(inspección mensual 30 d, recarga 12 m, hidrostática 5/12 a según agente;
// la fecha de fabricación del cilindro manda). Ventanas de amarillo: inspección ≤7 d
// (como base), recarga/hidrostática ≤30 d. TODAS las funciones toman `now` y `reglas`
// inyectables → unit tests con fechas exactas (criterio 4).
// API RP 14G (offshore): extintores Clase B junto a motores de combustión/turbinas
// en áreas encerradas; agentes AFFF/PQS/CO2 predominantes en hidrocarburos.
const DIA_MS = 86400000;
const MES_MS = 30.44 * DIA_MS;
const ANIO_MS = 365.25 * DIA_MS;

// Agente NFPA a partir de la columna `agente` o del tipo clásico del brigadista.
const TIPO_A_AGENTE = { ABC: 'PQS', BC: 'BC', CO2: 'CO2', PW: 'AGUA', AGUA: 'AGUA', FBQ: 'PQS', PQS: 'PQS', K: 'K', HALON: 'BC', AFFF: 'AFFF' };

const REGLAS_BASE = { mensual_dias: 30, recarga_meses: 12, hidro_anios: 5, amarillo_insp_dias: 7, amarillo_largo_dias: 30 };
// Hidrostática NFPA 10: CO2/agua 5 años; PQS en cilindro de acero 12 años.
// AFFF (espuma Oil & Gas, API RP 14G): 5 años.
const HIDRO_POR_AGENTE = { PQS: 12, CO2: 5, AGUA: 5, BC: 5, K: 5, AFFF: 5 };

function parseTs(v) {
  if (!v) return NaN;
  const s = String(v).trim().replace(' ', 'T');
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}

function agenteDe(ext) {
  const a = String(ext.agente || '').trim().toUpperCase();
  if (a) return a;
  return TIPO_A_AGENTE[String(ext.tipo || '').trim().toUpperCase()] || '';
}

function reglasDefecto() {
  const out = { '*': { ...REGLAS_BASE } };
  for (const [ag, hid] of Object.entries(HIDRO_POR_AGENTE)) out[ag] = { ...REGLAS_BASE, hidro_anios: hid };
  return out;
}

function merged(agente, reglas) {
  const r = reglas || reglasDefecto();
  return { ...(r['*'] || REGLAS_BASE), ...(agente && r[agente] ? r[agente] : {}) };
}

// Lista de vencimientos activos del extintor (epoch ms, motivo, ventana amarilla ms).
function vencimientosEfectivos(ext, reglas = null, now = Date.now()) {
  const out = [];
  const ag = agenteDe(ext);
  const r = merged(ag, reglas);
  if (ext.ultima_inspeccion && ext.proximo_vencimiento) {
    const t = parseTs(ext.proximo_vencimiento);
    if (!Number.isNaN(t)) out.push({ epoch: t, motivo: 'inspeccion_mensual', ventanaMs: r.amarillo_insp_dias * DIA_MS });
  }
  const vr = parseTs(ext.venc_recarga);
  if (!Number.isNaN(vr)) out.push({ epoch: vr, motivo: 'recarga_taller', ventanaMs: r.amarillo_largo_dias * DIA_MS });
  else {
    const ur = parseTs(ext.ultima_recarga);
    if (!Number.isNaN(ur)) out.push({ epoch: ur + r.recarga_meses * MES_MS, motivo: 'recarga_taller', ventanaMs: r.amarillo_largo_dias * DIA_MS });
  }
  const vh = parseTs(ext.venc_hidro);
  if (!Number.isNaN(vh)) out.push({ epoch: vh, motivo: 'hidrostatica', ventanaMs: r.amarillo_largo_dias * DIA_MS });
  else {
    const fb = parseTs(ext.fecha_fabricacion);
    const anios = ag && r.hidro_anios ? r.hidro_anios : (ag ? HIDRO_POR_AGENTE[ag] : undefined);
    if (!Number.isNaN(fb) && anios) out.push({ epoch: fb + anios * ANIO_MS, motivo: 'hidrostatica', ventanaMs: r.amarillo_largo_dias * DIA_MS });
  }
  return out;
}

// {estado: vigente|por_vencer|vencido|rechazado|sin_inspeccionar, venceEn, motivo}
function estadoNfpa(ext, reglas = null, now = Date.now()) {
  if (Number(ext.rechazado) === 1) return { estado: 'rechazado', venceEn: null, motivo: 'rechazo_inspeccion' };
  if (!ext.ultima_inspeccion || !ext.proximo_vencimiento) return { estado: 'sin_inspeccionar', venceEn: null, motivo: null };
  const vs = vencimientosEfectivos(ext, reglas, now);
  if (!vs.length) return { estado: 'sin_inspeccionar', venceEn: null, motivo: null };
  let vencido = false, proximo = false;
  let minimo = Infinity, motivo = '';
  for (const v of vs) {
    if (v.epoch < now) vencido = true;
    else if (v.epoch - now <= v.ventanaMs) proximo = true;
    if (v.epoch < minimo) { minimo = v.epoch; motivo = v.motivo; }
  }
  const estado = vencido ? 'vencido' : proximo ? 'por_vencer' : 'vigente';
  return { estado, venceEn: new Date(minimo).toISOString(), motivo };
}

// --- Reglas desde BD (nfpa_reglas), cacheadas; setReglas() para pruebas/injection ---
const db = require('../db');
let cache = null;

async function obtenerReglas(forzar = false) {
  if (cache && !forzar) return cache;
  try {
    const rows = await db.all('SELECT agente, mensual_dias, recarga_meses, hidro_anios, amarillo_insp_dias, amarillo_largo_dias FROM nfpa_reglas');
    if (!rows.length) return (cache = reglasDefecto());
    const r = reglasDefecto();
    for (const row of rows) {
      const ag = String(row.agente || '*').toUpperCase();
      r[ag] = {
        mensual_dias: Number(row.mensual_dias) || REGLAS_BASE.mensual_dias,
        recarga_meses: Number(row.recarga_meses) || REGLAS_BASE.recarga_meses,
        hidro_anios: Number(row.hidro_anios) || 0,
        amarillo_insp_dias: Number(row.amarillo_insp_dias) || REGLAS_BASE.amarillo_insp_dias,
        amarillo_largo_dias: Number(row.amarillo_largo_dias) || REGLAS_BASE.amarillo_largo_dias
      };
    }
    return (cache = r);
  } catch (_) {
    return reglasDefecto(); // BD sin migrar todavía: reglas por defecto, nunca 500
  }
}

// Ventana mensual según reglas (para el POST de inspección).
function mensualDias(agente = '', reglas = null) { return merged(String(agente).toUpperCase(), reglas).mensual_dias; }

function setReglas(r) { cache = r; }
function limpiarCacheReglas() { cache = null; }

module.exports = {
  DIA_MS, MES_MS, ANIO_MS, REGLAS_BASE, HIDRO_POR_AGENTE, TIPO_A_AGENTE,
  agenteDe, reglasDefecto, vencimientosEfectivos, estadoNfpa,
  obtenerReglas, mensualDias, setReglas, limpiarCacheReglas, parseTs
};
