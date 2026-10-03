'use strict';
const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { estadoCalculado } = require('../lib/estado');
const { sendEvent } = require('../lib/webhook');
const nfpa = require('../lib/nfpa');
const { construirCsv } = require('../lib/reemplazos');

const router = express.Router();

async function panelData() {
  const rows = await db.all('SELECT * FROM extintores WHERE activo = 1');
  const now = Date.now();
  const reglas = await nfpa.obtenerReglas();
  const panel = { verde: [], amarillo: [], rojo: [], negro: [] };
  for (const r of rows) {
    const est = estadoCalculado(r, now, reglas);
    let metadata = null;
    try { metadata = r.metadata ? JSON.parse(r.metadata) : null; } catch (_) { metadata = null; }
    const item = {
      tag: r.tag, ubicacion: r.ubicacion, tipo: r.tipo, agente: r.agente || '', capacidad_l: r.capacidad_l,
      proximo_vencimiento: r.proximo_vencimiento, estado_inspeccion: r.estado_inspeccion,
      metadata, rechazado: Number(r.rechazado) === 1, estadoCalculado: est
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
    // Spec criterio 9: agrupa por área, ordena por urgencia, escapa comas (lib/reemplazos).
    const body = construirCsv(panel);
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="reemplazo-extintores-${stamp}.csv"`);
    res.send(body);
  } catch (e) { next(e); }
});

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
