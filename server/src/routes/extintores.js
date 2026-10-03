'use strict';
const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { bad, cleanStr, toInt01, toNum, validDate, TAG_RE, ESTADOS_INSP, paginate, searchLike } = require('../middleware/validate');
const { estadoCalculado } = require('../lib/estado');

const router = express.Router();

// body -> {rec, error}. full=true exige campos obligatorios.
function parseRec(body, full) {
  const rec = {};
  const errs = [];
  if (body.tag !== undefined) {
    const t = cleanStr(body.tag, 32);
    if (!t || !TAG_RE.test(t)) errs.push('tag: alfanumérico (a-z0-9_-), 2-32 chars');
    else rec.tag = t.toUpperCase();
  } else if (full) errs.push('tag es requerido');

  if (body.ubicacion !== undefined) {
    const v = cleanStr(body.ubicacion, 255);
    if (!v) errs.push('ubicacion inválida');
    else rec.ubicacion = v;
  } else if (full) errs.push('ubicacion es requerido');

  if (body.tipo !== undefined) rec.tipo = cleanStr(body.tipo, 64) || '';
  if (body.notas !== undefined) rec.notas = cleanStr(body.notas, 4000);

  for (const f of ['capacidad_l', 'presion_bar']) {
    if (body[f] !== undefined) {
      const n = toNum(body[f]);
      if (n === undefined || n < 0 || n > 100000) errs.push(`${f}: número inválido`);
      else rec[f] = n;
    }
  }
  for (const f of ['lat', 'lng']) {
    if (body[f] !== undefined) {
      const n = toNum(body[f]);
      const lim = f === 'lat' ? 90 : 180;
      if (n === undefined || n < -lim || n > lim) errs.push(`${f}: fuera de rango`);
      else rec[f] = n;
    }
  }
  for (const f of ['fecha_fabricacion', 'ultima_inspeccion', 'proximo_vencimiento']) {
    if (body[f] !== undefined) {
      const v = validDate(body[f]);
      if (v === undefined) errs.push(`${f}: fecha inválida (ISO 8601)`);
      else rec[f] = v;
    }
  }
  if (body.estado_inspeccion !== undefined) {
    const v = cleanStr(body.estado_inspeccion, 8);
    if (!ESTADOS_INSP.includes(v)) errs.push(`estado_inspeccion: ${ESTADOS_INSP.join('|')}`);
    else rec.estado_inspeccion = v;
  }
  if (body.rechazado !== undefined) {
    const v = toInt01(body.rechazado);
    if (v === null) errs.push('rechazado: booleano (true/false)');
    else rec.rechazado = v;
  }
  return { rec, error: errs.length ? errs.join('; ') : null };
}

function withEstado(row, now) {
  return { ...row, rechazado: Number(row.rechazado) === 1, estadoCalculado: estadoCalculado(row, now) };
}

router.get('/extinguishers', auth, async (req, res, next) => {
  try {
    const { page, size, offset } = paginate(req.query);
    const q = searchLike(req.query.q);
    const estado = cleanStr(req.query.estado, 20);
    const now = Date.now();
    let rows = await db.all('SELECT * FROM extintores WHERE activo = 1');
    let items = rows.map((r) => withEstado(r, now));
    if (estado) items = items.filter((r) => r.estadoCalculado === estado);
    if (q) {
      const needle = q.replace(/[%_]/g, '').toLowerCase();
      items = items.filter((r) =>
        (r.tag || '').toLowerCase().includes(needle) ||
        (r.ubicacion || '').toLowerCase().includes(needle) ||
        (r.tipo || '').toLowerCase().includes(needle));
    }
    items.sort((a, b) => (a.tag < b.tag ? -1 : 1));
    res.json({
      items: items.slice(offset, offset + size),
      total: items.length,
      page,
      size
    });
  } catch (e) { next(e); }
});

router.get('/extinguishers/:tag', auth, async (req, res, next) => {
  try {
    const row = await db.get('SELECT * FROM extintores WHERE tag = ? AND activo = 1', [req.params.tag.toUpperCase()]);
    if (!row) return res.status(404).json({ error: 'not_found', msg: 'Extintor no encontrado' });
    res.json(withEstado(row));
  } catch (e) { next(e); }
});

router.post('/extinguishers', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rec, error } = parseRec(req.body || {}, true);
    if (error) return bad(res, error);
    const exists = await db.get('SELECT tag FROM extintores WHERE tag = ?', [rec.tag]);
    if (exists) return res.status(409).json({ error: 'conflict', msg: `tag "${rec.tag}" ya existe` });
    const now = new Date().toISOString();
    await db.run(
      `INSERT INTO extintores
        (tag, ubicacion, tipo, capacidad_l, presion_bar, fecha_fabricacion, ultima_inspeccion,
         proximo_vencimiento, estado_inspeccion, rechazado, notas, lat, lng, activo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [
        rec.tag, rec.ubicacion, rec.tipo || '', rec.capacidad_l ?? null, rec.presion_bar ?? null,
        rec.fecha_fabricacion ?? null, rec.ultima_inspeccion ?? null, rec.proximo_vencimiento ?? null,
        rec.estado_inspeccion || 'n_a', rec.rechazado ?? 0, rec.notas ?? null, rec.lat ?? null, rec.lng ?? null,
        now, now
      ]
    );
    const row = await db.get('SELECT * FROM extintores WHERE tag = ?', [rec.tag]);
    res.status(201).json(withEstado(row));
  } catch (e) { next(e); }
});

router.patch('/extinguishers/:tag', auth, async (req, res, next) => {
  try {
    const tag = req.params.tag.toUpperCase();
    const row = await db.get('SELECT * FROM extintores WHERE tag = ? AND activo = 1', [tag]);
    if (!row) return res.status(404).json({ error: 'not_found', msg: 'Extintor no encontrado' });
    const { rec, error } = parseRec(req.body || {}, false);
    if (error) return bad(res, error);
    delete rec.tag; // el tag no se renombra por PATCH
    const cols = Object.keys(rec);
    if (!cols.length) return bad(res, 'Nada que actualizar');
    const now = new Date().toISOString();
    const sets = cols.map((c) => `${c} = ?`).join(', ');
    await db.run(`UPDATE extintores SET ${sets}, updated_at = ? WHERE tag = ?`, [...cols.map((c) => rec[c]), now, tag]);
    const updated = await db.get('SELECT * FROM extintores WHERE tag = ?', [tag]);
    res.json(withEstado(updated));
  } catch (e) { next(e); }
});

// Soft delete: activo = 0
router.delete('/extinguishers/:tag', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const tag = req.params.tag.toUpperCase();
    const r = await db.run('UPDATE extintores SET activo = 0, updated_at = ? WHERE tag = ? AND activo = 1', [new Date().toISOString(), tag]);
    if (!r.changes) return res.status(404).json({ error: 'not_found', msg: 'Extintor no encontrado' });
    res.json({ ok: true, tag, activo: false });
  } catch (e) { next(e); }
});

module.exports = router;
