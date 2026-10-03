'use strict';
const express = require('express');
const db = require('../db');
const { auth } = require('../middleware/auth');
const { bad, cleanStr, toNum, validDate, B64_RE, paginate } = require('../middleware/validate');
const { esCritica } = require('../lib/estado');
const { sendEvent } = require('../lib/webhook');

const router = express.Router();
const MAX_FOTO_CHARS = 4000000;

router.post('/inspections', auth, async (req, res, next) => {
  try {
    const body = req.body || {};
    const tag = cleanStr(body.tag, 32);
    if (!tag) return bad(res, 'tag es requerido');
    const ext = await db.get('SELECT * FROM extintores WHERE tag = ? AND activo = 1', [tag.toUpperCase()]);
    if (!ext) return res.status(404).json({ error: 'not_found', msg: 'Extintor no encontrado' });

    if (!body.resultados || typeof body.resultados !== 'object' || Array.isArray(body.resultados)) {
      return bad(res, 'resultados debe ser un objeto {clave: bool}');
    }
    const items = await db.all('SELECT clave FROM checklist_items WHERE activo = 1');
    const claves = items.map((i) => i.clave);
    const setClaves = new Set(claves);
    const desconocidas = Object.keys(body.resultados).filter((k) => !setClaves.has(k));
    if (desconocidas.length) return bad(res, `Claves de checklist desconocidas: ${desconocidas.join(', ')}`);

    const resultados = {};
    for (const c of claves) {
      const v = body.resultados[c];
      if (v !== undefined && typeof v !== 'boolean' && v !== 0 && v !== 1) {
        return bad(res, `resultados.${c} debe ser booleano`);
      }
      resultados[c] = v === undefined ? false : Boolean(v);
    }
    const fallas = claves.filter((c) => !resultados[c]);
    const criticas = fallas.filter(esCritica);
    const rechazado = criticas.length > 0 ? 1 : 0;
    const estado_inspeccion = fallas.length ? 'falla' : 'pasa';

    const observaciones = body.observaciones !== undefined ? cleanStr(body.observaciones, 4000) : null;
    let foto = null;
    if (body.foto_evidencia_base64 !== undefined && body.foto_evidencia_base64 !== null && body.foto_evidencia_base64 !== '') {
      const f = String(body.foto_evidencia_base64);
      if (f.length > MAX_FOTO_CHARS || !B64_RE.test(f)) return bad(res, 'foto_evidencia_base64 no válida o demasiado grande');
      foto = f;
    }
    let lat = ext.lat, lng = ext.lng;
    if (body.gps !== undefined && body.gps !== null) {
      if (typeof body.gps !== 'object') return bad(res, 'gps debe ser {lat,lng}');
      const nLat = toNum(body.gps.lat); const nLng = toNum(body.gps.lng);
      if (nLat === undefined || nLat < -90 || nLat > 90) return bad(res, 'gps.lat inválida');
      if (nLng === undefined || nLng < -180 || nLng > 180) return bad(res, 'gps.lng inválida');
      lat = nLat; lng = nLng;
    }
    const dispositivo = body.dispositivo !== undefined ? cleanStr(body.dispositivo, 128) : null;

    const now = new Date();
    const nowIso = now.toISOString();
    const proxIso = new Date(now.getTime() + 30 * 86400000).toISOString();
    let inspId = null;

    await db.transaction(async (tx) => {
      const r = await tx.run(
        `INSERT INTO inspecciones
          (tag, resultados, fallas, criticas_fallan, observaciones, foto, lat, lng, dispositivo, inspector_id, inspector_username, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          ext.tag, JSON.stringify(resultados), JSON.stringify(fallas), criticas.length ? 1 : 0,
          observaciones, foto, lat, lng, dispositivo, req.user.id, req.user.username, nowIso
        ]
      );
      inspId = r.lastInsertRowid;
      await tx.run(
        `UPDATE extintores SET ultima_inspeccion = ?, proximo_vencimiento = ?, estado_inspeccion = ?,
          rechazado = ?, lat = ?, lng = ?, updated_at = ? WHERE tag = ?`,
        [nowIso, proxIso, estado_inspeccion, rechazado, lat, lng, nowIso, ext.tag]
      );
    });

    const row = await db.get('SELECT * FROM extintores WHERE tag = ?', [ext.tag]);
    res.status(201).json({
      id: inspId,
      tag: ext.tag,
      fecha: nowIso,
      proximo_vencimiento: proxIso,
      resultados,
      fallas,
      criticas: fallas.filter(esCritica),
      estado_inspeccion,
      rechazado: rechazado === 1,
      extintor: { tag: row.tag, ultima_inspeccion: row.ultima_inspeccion, proximo_vencimiento: row.proximo_vencimiento, estado_inspeccion: row.estado_inspeccion, rechazado: row.rechazado }
    });

    if (fallas.length) {
      sendEvent('inspeccion_con_fallas', {
        tag: ext.tag, ubicacion: ext.ubicacion, inspector: req.user.username,
        fallas, criticas: fallas.filter(esCritica), rechazado: rechazado === 1, inspeccion_id: inspId
      }).catch(() => {});
    }
  } catch (e) { next(e); }
});

router.get('/inspections', auth, async (req, res, next) => {
  try {
    const { page, size, offset } = paginate(req.query);
    const where = [];
    const params = [];
    if (req.query.tag) { where.push('tag = ?'); params.push(String(req.query.tag).toUpperCase()); }
    if (req.query.desde !== undefined) {
      const v = validDate(req.query.desde);
      if (v === undefined) return bad(res, 'desde: fecha inválida');
      if (v) { where.push('created_at >= ?'); params.push(v); }
    }
    if (req.query.hasta !== undefined) {
      const v = validDate(req.query.hasta);
      if (v === undefined) return bad(res, 'hasta: fecha inválida');
      if (v) { where.push('created_at <= ?'); params.push(v); }
    }
    const wsql = where.length ? 'WHERE ' + where.join(' AND ') : '';
    const totalRow = await db.get(`SELECT COUNT(*) AS c FROM inspecciones ${wsql}`, params);
    const rows = await db.all(
      `SELECT id, tag, resultados, fallas, criticas_fallan, observaciones, lat, lng, dispositivo,
              inspector_id, inspector_username, created_at,
              CASE WHEN foto IS NOT NULL AND foto <> '' THEN 1 ELSE 0 END AS tiene_foto
       FROM inspecciones ${wsql} ORDER BY id DESC LIMIT ? OFFSET ?`,
      [...params, size, offset]
    );
    res.json({
      items: rows.map((r) => ({ ...r, resultados: JSON.parse(r.resultados || '{}'), fallas: JSON.parse(r.fallas || '[]'), tiene_foto: Number(r.tiene_foto) === 1 })),
      total: totalRow ? Number(totalRow.c) : 0,
      page,
      size
    });
  } catch (e) { next(e); }
});

// Foto de evidencia de una inspección (fila completa).
router.get('/inspections/:id', auth, async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return bad(res, 'id inválido');
    const r = await db.get('SELECT * FROM inspecciones WHERE id = ?', [id]);
    if (!r) return res.status(404).json({ error: 'not_found', msg: 'Inspección no encontrada' });
    r.resultados = JSON.parse(r.resultados || '{}');
    r.fallas = JSON.parse(r.fallas || '[]');
    res.json(r);
  } catch (e) { next(e); }
});

module.exports = router;
