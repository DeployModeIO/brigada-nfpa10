'use strict';
const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { estadoCalculado } = require('../lib/estado');
const { sendEvent } = require('../lib/webhook');

const router = express.Router();

function csvCell(v) {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

async function panelData() {
  const rows = await db.all('SELECT * FROM extintores WHERE activo = 1');
  const now = Date.now();
  const panel = { verde: [], amarillo: [], rojo: [], negro: [] };
  for (const r of rows) {
    const est = estadoCalculado(r, now);
    const item = {
      tag: r.tag, ubicacion: r.ubicacion, tipo: r.tipo, capacidad_l: r.capacidad_l,
      proximo_vencimiento: r.proximo_vencimiento, estado_inspeccion: r.estado_inspeccion,
      rechazado: Number(r.rechazado) === 1, estadoCalculado: est
    };
    if (est === 'vigente') panel.verde.push(item);
    else if (est === 'por_vencer') panel.amarillo.push(item);
    else if (est === 'vencido') panel.rojo.push(item);
    else if (est === 'rechazado') panel.negro.push(item);
    // sin_inspeccionar se excluye del semáforo (aparece en /extinguishers)
  }
  const byVenc = (a, b) => String(a.proximo_vencimiento || '9999').localeCompare(String(b.proximo_vencimiento || '9999'));
  panel.amarillo.sort(byVenc); panel.rojo.sort(byVenc);
  panel.cont = {
    v: panel.verde.length,
    g: panel.amarillo.length,
    r: panel.rojo.length,
    n: panel.negro.length
  };
  return panel;
}

router.get('/alerts/panel', auth, async (req, res, next) => {
  try { res.json(await panelData()); } catch (e) { next(e); }
});

// Reemplazos necesarios: vencidos + rechazados.
router.get('/alerts/replacement-list.csv', auth, async (req, res, next) => {
  try {
    const panel = await panelData();
    const rows = [...panel.rojo, ...panel.negro].sort(byTag);
    const header = ['tag', 'ubicacion', 'tipo', 'capacidad_l', 'proximo_vencimiento', 'motivo'];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push([r.tag, r.ubicacion, r.tipo, r.capacidad_l, r.proximo_vencimiento,
        r.estadoCalculado === 'rechazado' ? 'rechazado' : 'vencido'].map(csvCell).join(','));
    }
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reemplazo-extintores-${stamp}.csv"`);
    res.send(lines.join('\n') + '\n');
  } catch (e) { next(e); }
});

function byTag(a, b) { return a.tag.localeCompare(b.tag); }

// Prueba manual del webhook de la empresa (admin).
router.post('/alerts/webhook-test', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const r = await sendEvent('webhook_test', { mensaje: 'Prueba manual desde /api/v1/alerts/webhook-test' });
    if (r.skipped) return res.status(400).json({ error: 'not_configured', msg: 'webhookUrl no está configurado en /settings' });
    if (!r.ok) return res.status(502).json({ error: 'webhook_error', msg: r.error || `HTTP ${r.status}` });
    res.json({ ok: true, status: r.status });
  } catch (e) { next(e); }
});

module.exports = { router, panelData };
