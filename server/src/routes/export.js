'use strict';
const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { estadoCalculado } = require('../lib/estado');
const nfpa = require('../lib/nfpa');

// M2 (fixes 03/10/2026): ExcelJS trata los strings que empiezan por = + - @ como
// FÓRMULA. Toda celda de texto de origen usuario pasa por SEG antes de addRow.
function SEG(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = (typeof v === 'string' && /^[=+\-@\t\r]/.test(v)) ? "'" + v : v;
  }
  return out;
}

// Firma de versión de la planilla exportada (criterio 10): cambios de columnas o de
// reglas NFPA suben el número; el auditor puede atar el archivo a esta definición.
const EXPORT_VERSION = 'brigada-nfpa10/xlsx-v1.1 (NFPA10 §7.2, reglas nfpa_reglas)';

const router = express.Router();

router.get('/export/extinguishers.xlsx', auth, async (req, res, next) => {
  try {
    const rows = await db.all('SELECT * FROM extintores WHERE activo = 1 ORDER BY tag ASC');
    const reglas = await nfpa.obtenerReglas();
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Brigada NFPA 10';
    wb.description = EXPORT_VERSION;
    wb.created = new Date();
    const ws = wb.addWorksheet('Extintores');

    ws.columns = [
      { header: 'Tag', key: 'tag', width: 14 },
      { header: 'Ubicación', key: 'ubicacion', width: 30 },
      { header: 'Tipo', key: 'tipo', width: 10 },
      { header: 'Capacidad (L)', key: 'capacidad_l', width: 13 },
      { header: 'Presión (bar)', key: 'presion_bar', width: 13 },
      { header: 'Fabricación', key: 'fecha_fabricacion', width: 18 },
      { header: 'Agente', key: 'agente', width: 9 },
      { header: 'Última inspección', key: 'ultima_inspeccion', width: 22 },
      { header: 'Próximo vencimiento', key: 'proximo_vencimiento', width: 22 },
      { header: 'Venc. recarga', key: 'venc_recarga', width: 20 },
      { header: 'Venc. hidrostática', key: 'venc_hidro', width: 20 },
      { header: 'Estado inspección', key: 'estado_inspeccion', width: 16 },
      { header: 'Rechazado', key: 'rechazado', width: 11 },
      { header: 'Estado calculado', key: 'estadoCalculado', width: 17 },
      { header: 'Lat', key: 'lat', width: 12 },
      { header: 'Lng', key: 'lng', width: 12 },
      { header: 'Notas', key: 'notas', width: 40 }
    ];
    ws.getRow(1).font = { bold: true };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0EA5E9' } };

    const COLOR = { vigente: 'FF22C55E', por_vencer: 'FFEAB308', vencido: 'FFEF4444', rechazado: 'FF000000', sin_inspeccionar: 'FF9CA3AF' };
    const now = Date.now();
    for (const r of rows) {
      const est = estadoCalculado(r, now, reglas);
      const added = ws.addRow(SEG({
        tag: r.tag, ubicacion: r.ubicacion, tipo: r.tipo, capacidad_l: r.capacidad_l,
        presion_bar: r.presion_bar, fecha_fabricacion: r.fecha_fabricacion,
        agente: r.agente || nfpa.agenteDe(r),
        ultima_inspeccion: r.ultima_inspeccion, proximo_vencimiento: r.proximo_vencimiento,
        venc_recarga: r.venc_recarga || '', venc_hidro: r.venc_hidro || '',
        estado_inspeccion: r.estado_inspeccion, rechazado: Number(r.rechazado) ? 'SÍ' : 'no',
        estadoCalculado: est, lat: r.lat, lng: r.lng, notas: r.notas
      }));
      added.getCell('estadoCalculado').font = {
        color: { argb: est === 'rechazado' ? 'FFFFFFFF' : COLOR[est] || 'FF000000' },
        bold: true
      };
      if (est === 'rechazado') added.getCell('estadoCalculado').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    }
    // Fila de firma de versión (criterio 10).
    const firma = ws.addRow(SEG({ tag: EXPORT_VERSION, ubicacion: `generado ${new Date().toISOString()}` }));
    firma.getCell('tag').font = { italic: true, color: { argb: 'FF6B7280' } };

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="extintores-nfpa10-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

module.exports = router;
module.exports.SEG = SEG;
