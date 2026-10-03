'use strict';
// Cálculo de estado según vencimiento (NFPA 10) y reglas de rechazo.
const CRITICAS = ['presion_rango', 'precinto_intacto', 'manguera_sin_fisuras'];

function parseTs(v) {
  if (!v) return NaN;
  const s = String(v).trim().replace(' ', 'T');
  const t = Date.parse(s);
  return Number.isNaN(t) ? NaN : t;
}

// vigente | por_vencer (<=7d) | vencido | rechazado | sin_inspeccionar
function estadoCalculado(e, now = Date.now()) {
  if (Number(e.rechazado) === 1) return 'rechazado';
  if (!e.ultima_inspeccion || !e.proximo_vencimiento) return 'sin_inspeccionar';
  const t = parseTs(e.proximo_vencimiento);
  if (Number.isNaN(t)) return 'sin_inspeccionar';
  if (t < now) return 'vencido';
  if (t - now <= 7 * 86400000) return 'por_vencer';
  return 'vigente';
}

function esCritica(clave) { return CRITICAS.includes(clave); }

module.exports = { CRITICAS, estadoCalculado, esCritica };
