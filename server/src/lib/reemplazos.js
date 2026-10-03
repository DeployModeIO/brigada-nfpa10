'use strict';
// Lista de reemplazo (spec §Reglas 4 + criterio 9): agrupa por área, ordena por
// urgencia (rechazado > vencido; dentro de vencido, más días de mora primero) y
// escapa CSV. Función PURA para unit test; la ruta /alerts/replacement-list.csv la usa.
const DIA_MS = 86400000;

// M2 (fixes seguridad 03/10/2026): neutraliza CSV formula injection. Un valor que
// comienza con = + - @ TAB o CR es interpretado como fórmula por Excel/Sheets: se
// prefija con apóstrofo ANTES de escapar el separador.
function csvCell(v) {
  let s = v === null || v === undefined ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\r\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// Área = prefijo de ubicacion antes de " (" o " - " (formato del seed/importación),
// o metadata.area / ubicacion_detalle.nave cuando vienen de la referencia del cliente.
function areaDe(item) {
  const md = item.metadata || {};
  if (md.area) return String(md.area);
  if (md.ubicacion_detalle && md.ubicacion_detalle.nave) return String(md.ubicacion_detalle.nave);
  const u = String(item.ubicacion || '').trim();
  const m = u.split(/\s*[（(]\s*|\s+-\s+/)[0].trim();
  return m || 'SIN ÁREA';
}

function diasVencido(item, now = Date.now()) {
  if (!item.proximo_vencimiento) return 0;
  const t = Date.parse(String(item.proximo_vencimiento).replace(' ', 'T'));
  return Number.isNaN(t) ? 0 : Math.max(0, Math.ceil((now - t) / DIA_MS));
}

// rows: items del panel con estadoCalculado vencido|rechazado.
// Devuelve [{area, tag, tipo, capacidad_l, proximo_vencimiento, motivo, dias_mora}]
// agrupado por área (áreas con rechazados primero, luego por mora máxima) y por urgencia.
function filasReemplazo(panel, now = Date.now()) {
  const items = [...(panel.rojo || []), ...(panel.negro || [])];
  const porArea = new Map();
  for (const it of items) {
    const a = areaDe(it);
    if (!porArea.has(a)) porArea.set(a, []);
    porArea.get(a).push(it);
  }
  const areas = [];
  for (const [area, sus] of porArea.entries()) {
    sus.sort((x, y) => {
      const rx = x.estadoCalculado === 'rechazado' ? 0 : 1;
      const ry = y.estadoCalculado === 'rechazado' ? 0 : 1;
      if (rx !== ry) return rx - ry;
      const dx = diasVencido(x, now), dy = diasVencido(y, now);
      if (dy !== dx) return dy - dx;
      return String(x.tag).localeCompare(String(y.tag));
    });
    const moraMax = Math.max(...sus.map((s) => (s.estadoCalculado === 'rechazado' ? Infinity : diasVencido(s, now))));
    areas.push({ area, sus, moraMax });
  }
  areas.sort((a, b) => {
    if (b.moraMax !== a.moraMax) return (b.moraMax === Infinity ? 2 : b.moraMax) - (a.moraMax === Infinity ? 2 : a.moraMax);
    return String(a.area).localeCompare(String(b.area));
  });
  return areas.flatMap(({ area, sus }) => sus.map((it) => ({
    area,
    tag: it.tag,
    ubicacion: it.ubicacion || '',
    tipo: it.tipo || it.agente || '',
    capacidad_l: it.capacidad_l,
    proximo_vencimiento: it.proximo_vencimiento,
    motivo: it.estadoCalculado === 'rechazado' ? 'rechazado' : 'vencido',
    dias_mora: it.estadoCalculado === 'rechazado' ? '' : diasVencido(it, now)
  })));
}

function construirCsv(panel, now = Date.now()) {
  const header = ['area', 'tag', 'ubicacion', 'tipo', 'capacidad_l', 'proximo_vencimiento', 'motivo', 'dias_mora'];
  const lines = [header.map(csvCell).join(',')];
  for (const r of filasReemplazo(panel, now)) {
    lines.push([r.area, r.tag, r.ubicacion, r.tipo, r.capacidad_l, r.proximo_vencimiento, r.motivo, r.dias_mora].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

module.exports = { csvCell, areaDe, diasVencido, filasReemplazo, construirCsv };
