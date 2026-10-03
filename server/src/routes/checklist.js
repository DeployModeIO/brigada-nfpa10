'use strict';
const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { bad, cleanStr, toInt01, toNum, TAG_RE } = require('../middleware/validate');

const router = express.Router();

function parseClave(body) {
  const rec = {};
  const errs = [];
  if (body.clave !== undefined) {
    const v = cleanStr(body.clave, 64);
    if (!v || !TAG_RE.test(v)) errs.push('clave: alfanumérica (a-z0-9_-), 2-64');
    else rec.clave = v.toLowerCase();
  }
  if (body.etiqueta !== undefined) {
    const v = cleanStr(body.etiqueta, 255);
    if (!v) errs.push('etiqueta inválida');
    else rec.etiqueta = v;
  }
  if (body.orden !== undefined) {
    const n = toNum(body.orden);
    if (n === undefined || !Number.isInteger(n)) errs.push('orden: entero');
    else rec.orden = n;
  }
  if (body.activo !== undefined) {
    const v = toInt01(body.activo);
    if (v === null) errs.push('activo: booleano');
    else rec.activo = v;
  }
  // Crítico = DATO configurable por BD (spec §Reglas 1): su falla rechaza la inspección.
  if (body.critico !== undefined) {
    const v = toInt01(body.critico);
    if (v === null) errs.push('critico: booleano');
    else rec.critico = v;
  }
  return { rec, error: errs.length ? errs.join('; ') : null };
}

router.get('/checklist-items', auth, async (req, res, next) => {
  try {
    const rows = await db.all('SELECT id, clave, etiqueta, orden, critico, activo FROM checklist_items WHERE activo = 1 ORDER BY orden ASC, id ASC');
    res.json(rows);
  } catch (e) { next(e); }
});

router.post('/checklist-items', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const { rec, error } = parseClave(req.body || {});
    if (error) return bad(res, error);
    if (!rec.clave) return bad(res, 'clave es requerida');
    if (!rec.etiqueta) return bad(res, 'etiqueta es requerida');
    const exists = await db.get('SELECT id FROM checklist_items WHERE clave = ?', [rec.clave]);
    if (exists) return res.status(409).json({ error: 'conflict', msg: `clave "${rec.clave}" ya existe` });
    const r = await db.run(
      'INSERT INTO checklist_items (clave, etiqueta, orden, critico, activo) VALUES (?, ?, ?, ?, ?)',
      [rec.clave, rec.etiqueta, rec.orden ?? 0, rec.critico ?? 0, rec.activo ?? 1]
    );
    const row = await db.get('SELECT id, clave, etiqueta, orden, critico, activo FROM checklist_items WHERE id = ?', [r.lastInsertRowid]);
    res.status(201).json(row);
  } catch (e) { next(e); }
});

router.patch('/checklist-items/:id', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return bad(res, 'id inválido');
    const row = await db.get('SELECT * FROM checklist_items WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'not_found', msg: 'Ítem no encontrado' });
    const { rec, error } = parseClave(req.body || {});
    if (error) return bad(res, error);
    if (rec.clave && rec.clave !== row.clave) {
      const dup = await db.get('SELECT id FROM checklist_items WHERE clave = ?', [rec.clave]);
      if (dup) return res.status(409).json({ error: 'conflict', msg: `clave "${rec.clave}" ya existe` });
    }
    const cols = Object.keys(rec);
    if (!cols.length) return bad(res, 'Nada que actualizar');
    await db.run(`UPDATE checklist_items SET ${cols.map((c) => `${c} = ?`).join(', ')} WHERE id = ?`, [...cols.map((c) => rec[c]), id]);
    res.json(await db.get('SELECT id, clave, etiqueta, orden, critico, activo FROM checklist_items WHERE id = ?', [id]));
  } catch (e) { next(e); }
});

router.delete('/checklist-items/:id', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return bad(res, 'id inválido');
    const r = await db.run('DELETE FROM checklist_items WHERE id = ?', [id]);
    if (!r.changes) return res.status(404).json({ error: 'not_found', msg: 'Ítem no encontrado' });
    res.json({ ok: true, id });
  } catch (e) { next(e); }
});

module.exports = router;
