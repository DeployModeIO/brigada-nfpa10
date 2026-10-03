'use strict';
const express = require('express');
const ExcelJS = require('exceljs');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { estadoCalculado } = require('../lib/estado');

const router = express.Router();

router.get('/export/extinguishers.xlsx', auth, async (req, res, next) => {
  try {
    const rows = await db.all('SELECT * FROM extintores WHERE activo = 1 ORDER BY tag ASC');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'Brigada NFPA 10';
    wb.created = new Date();
    const ws = wb.addWorksheet('Extintores');

    ws.columns = [
      { header: 'Tag', key: 'tag', width: 14 },
      { header: 'Ubicación', key: 'ubicacion', width: 30 },
      { header: 'Tipo', key: 'tipo', width: 10 },
      { header: 'Capacidad (L)', key: 'capacidad_l', width: 13 },
      { header: 'Presión (bar)', key: 'presion_bar', width: 13 },
      { header: 'Fabricación', key: 'fecha_fabricacion', width: 18 },
      { header: 'Última inspección', key: 'ultima_inspeccion', width: 22 },
      { header: 'Próximo vencimiento', key: 'proximo_vencimiento', width: 22 },
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
      const est = estadoCalculado(r, now);
      const added = ws.addRow({
        tag: r.tag, ubicacion: r.ubicacion, tipo: r.tipo, capacidad_l: r.capacidad_l,
        presion_bar: r.presion_bar, fecha_fabricacion: r.fecha_fabricacion,
        ultima_inspeccion: r.ultima_inspeccion, proximo_vencimiento: r.proximo_vencimiento,
        estado_inspeccion: r.estado_inspeccion, rechazado: Number(r.rechazado) ? 'SÍ' : 'no',
        estadoCalculado: est, lat: r.lat, lng: r.lng, notas: r.notas
      });
      added.getCell('estadoCalculado').font = {
        color: { argb: est === 'rechazado' ? 'FFFFFFFF' : COLOR[est] || 'FF000000' },
        bold: true
      };
      if (est === 'rechazado') added.getCell('estadoCalculado').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF000000' } };
    }

    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="extintores-nfpa10-${stamp}.xlsx"`);
    await wb.xlsx.write(res);
    res.end();
  } catch (e) { next(e); }
});

module.exports = router;
