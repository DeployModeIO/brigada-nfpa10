'use strict';
const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { bad, cleanStr, toNum, validDate, B64_RE, paginate } = require('../middleware/validate');
const { criticasActivas, esCritica } = require('../lib/estado');
const { sendEvent, getSetting } = require('../lib/webhook');
const nfpa = require('../lib/nfpa');
const espejo = require('../integration/espejo');

const router = express.Router();
const MAX_FOTO_CHARS = 4000000;
// Importación: margen de reloj aceptado para la fecha de captura (skew dispositivo↔PC).
const SKEW_FUTURO_MS = 5 * 60 * 1000;
const MIN_CAPTURA_MS = Date.parse('2000-01-01T00:00:00Z');

// Núcleo reutilizable: registra UNA inspección. Lo usan POST /inspections (captura en
// línea) y POST /inspections/import (ingesta fiel desde campo), de modo que la ruta
// normal conserva EXACTAMENTE el comportamiento previo.
// opciones: { createdIso?, capturaId?, origen?, baseTs?, importacion?, inspectorUsername? }
//   - createdIso: fecha original de captura ⇒ created_at (default: ahora).
//   - baseTs: epoch ms de la captura ⇒ ancla del vencimiento mensual (default: Date.now()).
//   - capturaId/origen: se persisten tal cual en inspecciones (origen default 'local').
//   - importacion: true ⇒ nunca responde 403 por habilitación; deja nota de auditoría.
//   - inspectorUsername: en importación, username de terreno a resolver contra users.
async function registrarInspeccion({ body, user, opciones = {} }) {
  const importMode = !!opciones.importacion;
  const tag = cleanStr(body.tag, 32);
  if (!tag) return { status: 400, payload: { error: 'bad_request', msg: 'tag es requerido' } };
  const ext = await db.get('SELECT * FROM extintores WHERE tag = ? AND activo = 1', [tag.toUpperCase()]);
  if (!ext) return { status: 404, payload: { error: 'not_found', msg: 'Extintor no encontrado' } };

  // Spec §Reglas 3 + criterio 5: habilitación vigente obligatoria para firmar inspección.
  // Roles exentos (default supervisor|admin) pueden firmar SIN habilitación, pero queda
  // nota de auditoría en inspecciones.habilitacion.
  const tipoEq = nfpa.agenteDe(ext) || '*';
  const habRoles = String((await getSetting('habilitacionRoles')) || 'inspector').split(',').map((x) => x.trim()).filter(Boolean);

  // Inspector efectivo: en importación puede resolverse por username (fidelidad de terreno);
  // si no existe, firma el admin importador con nota 'importado_terreno:<username>'.
  let inspector = { id: user.id, username: user.username, rol: user.rol };
  let inspectorTerreno = null;
  if (importMode && opciones.inspectorUsername) {
    const u = await db.get('SELECT id, username, rol, activo, status FROM users WHERE username = ? AND activo = 1', [opciones.inspectorUsername]);
    if (u && String(u.status || 'activo') !== 'revocado') inspector = { id: u.id, username: u.username, rol: u.rol };
    else inspectorTerreno = opciones.inspectorUsername;
  }

  let habilitacionNota;
  if (inspectorTerreno) {
    habilitacionNota = `importado_terreno:${inspectorTerreno}`;
  } else if (habRoles.includes(inspector.rol)) {
    const habs = await db.all(
      "SELECT vigente_hasta FROM habilitaciones WHERE brigadista_user_id = ? AND activo = 1 AND (tipo_equipo = '*' OR tipo_equipo = ?)",
      [inspector.id, tipoEq]
    );
    const vigente = habs.some((h) => (nfpa.parseTs(h.vigente_hasta) || 0) >= Date.now());
    if (!vigente) {
      // Importación fiel: se registra igual aunque la habilitación esté vencida (nota de
      // auditoría); la captura en línea SÍ rechaza (comportamiento original).
      if (!importMode) {
        return {
          status: 403,
          payload: {
            error: 'habilitacion_vencida',
            msg: `Brigadista sin habilitación vigente para ${tipoEq === '*' ? 'este equipo' : `agente ${tipoEq}`}: inspección NO registrada`
          }
        };
      }
      habilitacionNota = 'importado_hab_vencida';
    } else {
      habilitacionNota = 'vigente';
    }
  } else if (inspector.rol === 'supervisor' || inspector.rol === 'admin') {
    habilitacionNota = `exenta_${inspector.rol}`;
  } else {
    habilitacionNota = 'no_requerida';
  }

  if (!body.resultados || typeof body.resultados !== 'object' || Array.isArray(body.resultados)) {
    return { status: 400, payload: { error: 'bad_request', msg: 'resultados debe ser un objeto {clave: bool}' } };
  }
  const items = await db.all('SELECT clave FROM checklist_items WHERE activo = 1');
  const claves = items.map((i) => i.clave);
  const setClaves = new Set(claves);
  const desconocidas = Object.keys(body.resultados).filter((k) => !setClaves.has(k));
  if (desconocidas.length) return { status: 400, payload: { error: 'bad_request', msg: `Claves de checklist desconocidas: ${desconocidas.join(', ')}` } };

  const resultados = {};
  for (const c of claves) {
    const v = body.resultados[c];
    if (v !== undefined && typeof v !== 'boolean' && v !== 0 && v !== 1) {
      return { status: 400, payload: { error: 'bad_request', msg: `resultados.${c} debe ser booleano` } };
    }
    resultados[c] = v === undefined ? false : Boolean(v);
  }
  const criticasSet = await criticasActivas();
  const fallas = claves.filter((c) => !resultados[c]);
  const criticas = fallas.filter((c) => criticasSet.has(c) || esCritica(c));
  const rechazado = criticas.length > 0 ? 1 : 0;
  const estado_inspeccion = fallas.length ? 'falla' : 'pasa';

  const observaciones = body.observaciones !== undefined ? cleanStr(body.observaciones, 4000) : null;
  let foto = null;
  if (body.foto_evidencia_base64 !== undefined && body.foto_evidencia_base64 !== null && body.foto_evidencia_base64 !== '') {
    const f = String(body.foto_evidencia_base64);
    if (f.length > MAX_FOTO_CHARS || !B64_RE.test(f)) return { status: 400, payload: { error: 'bad_request', msg: 'foto_evidencia_base64 no válida o demasiado grande' } };
    foto = f;
  }
  let lat = ext.lat, lng = ext.lng;
  if (body.gps !== undefined && body.gps !== null) {
    if (typeof body.gps !== 'object') return { status: 400, payload: { error: 'bad_request', msg: 'gps debe ser {lat,lng}' } };
    const nLat = toNum(body.gps.lat); const nLng = toNum(body.gps.lng);
    if (nLat === undefined || nLat < -90 || nLat > 90) return { status: 400, payload: { error: 'bad_request', msg: 'gps.lat inválida' } };
    if (nLng === undefined || nLng < -180 || nLng > 180) return { status: 400, payload: { error: 'bad_request', msg: 'gps.lng inválida' } };
    lat = nLat; lng = nLng;
  }
  const dispositivo = body.dispositivo !== undefined ? cleanStr(body.dispositivo, 128) : null;

  // Fidelidad temporal: created_at = fecha original de captura (o ahora); el vencimiento
  // mensual se mide desde baseTs (captura) y NO desde el reloj del PC que importa.
  const nowIso = opciones.createdIso || new Date().toISOString();
  const baseMs = opciones.baseTs !== undefined && opciones.baseTs !== null ? Number(opciones.baseTs) : Date.now();
  const capturaId = opciones.capturaId || null;
  const origen = opciones.origen || 'local';

  // Spec §Reglas 2: próximo vencimiento = min(mensual, recarga, hidrostática).
  const reglas = await nfpa.obtenerReglas();
  const mensualMs = baseMs + nfpa.mensualDias(tipoEq === '*' ? '' : tipoEq, reglas) * nfpa.DIA_MS;
  const otrasFechas = nfpa.vencimientosEfectivos({ ...ext, ultima_inspeccion: null, proximo_vencimiento: null }, reglas, baseMs)
    .map((v) => v.epoch);
  const proxIso = new Date(Math.min(mensualMs, ...otrasFechas)).toISOString();
  let inspId = null;

  await db.transaction(async (tx) => {
    const r = await tx.run(
      `INSERT INTO inspecciones
        (tag, resultados, fallas, criticas_fallan, observaciones, foto, lat, lng, dispositivo, inspector_id, inspector_username, created_at, habilitacion, motivo_rechazo, captura_id, origen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        ext.tag, JSON.stringify(resultados), JSON.stringify(fallas), criticas.length ? 1 : 0,
        observaciones, foto, lat, lng, dispositivo, inspector.id, inspector.username, nowIso,
        habilitacionNota, criticas.join(', ') || null, capturaId, origen
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
  return {
    status: 201,
    payload: {
      id: inspId,
      tag: ext.tag,
      fecha: nowIso,
      proximo_vencimiento: proxIso,
      resultados,
      fallas,
      criticas,
      habilitacion: habilitacionNota,
      estado_inspeccion,
      rechazado: rechazado === 1,
      extintor: { tag: row.tag, ultima_inspeccion: row.ultima_inspeccion, proximo_vencimiento: row.proximo_vencimiento, estado_inspeccion: row.estado_inspeccion, rechazado: row.rechazado }
    },
    eventos: {
      ext, fecha: nowIso, resultados, fallas, criticas, rechazado,
      observaciones, dispositivo, habilitacionNota, inspId,
      inspectorUsername: inspector.username
    }
  };
}

// Efectos post-respuesta (webhook + espejo), fail-silent como en el flujo original.
function emitirEventos(ev) {
  if (!ev) return;
  if (ev.fallas.length) {
    sendEvent('inspeccion_con_fallas', {
      tag: ev.ext.tag, ubicacion: ev.ext.ubicacion, inspector: ev.inspectorUsername,
      fallas: ev.fallas, criticas: ev.criticas, rechazado: ev.rechazado === 1, inspeccion_id: ev.inspId
    }).catch(() => {});
  }
  // Modo espejo (NORMA 3): cola fail-silent hacia tablas del cliente. Rechazo = orden
  // de trabajo (origen 'rechazos' además de la inspección completa).
  espejo.enqueue('inspecciones', {
    id: ev.inspId, tag: ev.ext.tag, fecha: ev.fecha, resultados: ev.resultados, fallas: ev.fallas, criticas: ev.criticas,
    rechazado: ev.rechazado === 1, observaciones: ev.observaciones, inspector_username: ev.inspectorUsername,
    dispositivo: ev.dispositivo, habilitacion: ev.habilitacionNota
  }).catch(() => {});
  if (ev.rechazado === 1) {
    espejo.enqueue('rechazos', {
      id: ev.inspId, tag: ev.ext.tag, fecha: ev.fecha, motivo: ev.criticas.join(', '),
      criticas: ev.criticas, inspector_username: ev.inspectorUsername, ubicacion: ev.ext.ubicacion
    }).catch(() => {});
  }
}

// Cuenta agregada de una importación. Con archivo_hash se acumula sobre la última fila de
// ese hash (una misma carga procesada ítem a ítem); sin él, cada llamada crea una fila
// independiente. Best-effort: un fallo aquí NUNCA voltea la respuesta de la inspección.
async function registrarImportacion({ archivoHash, dispositivo, creados = 0, duplicados = 0, errores = 0, detalle = null }) {
  try {
    const nowIso = new Date().toISOString();
    if (archivoHash) {
      const prev = await db.get('SELECT id FROM importaciones WHERE archivo_hash = ? ORDER BY id DESC LIMIT 1', [archivoHash]);
      if (prev) {
        await db.run(
          `UPDATE importaciones SET total = total + 1, creados = creados + ?, duplicados = duplicados + ?,
             errores = errores + ?, detalle = ?, dispositivo = COALESCE(?, dispositivo), ts = ? WHERE id = ?`,
          [creados, duplicados, errores, detalle, dispositivo, nowIso, prev.id]
        );
        return prev.id;
      }
    }
    const r = await db.run(
      `INSERT INTO importaciones (archivo_hash, dispositivo, total, creados, duplicados, errores, detalle, ts)
       VALUES (?, ?, 1, ?, ?, ?, ?, ?)`,
      [archivoHash || null, dispositivo || null, creados, duplicados, errores, detalle, nowIso]
    );
    return r.lastInsertRowid;
  } catch (e) {
    console.log(`[${new Date().toISOString()}] [import] no se pudo registrar la cuenta: ${e.message}`);
    return null;
  }
}

router.post('/inspections', auth, async (req, res, next) => {
  try {
    const r = await registrarInspeccion({ body: req.body || {}, user: req.user });
    res.status(r.status).json(r.payload);
    emitirEventos(r.eventos);
  } catch (e) { next(e); }
});

// Ingesta fiel desde la app Android de terreno: conserva la fecha de captura y el inspector
// original, ancla el vencimiento a la captura y es idempotente por captura_id (SELECT, no
// índice único: portabilidad de dialectos). Body = UN ítem. Solo admin.
router.post('/inspections/import', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const meta = body.meta && typeof body.meta === 'object' ? body.meta : {};
    const archivoHash = cleanStr(meta.archivo_hash, 64);
    const dispositivo = cleanStr(body.dispositivo, 128) || cleanStr(meta.dispositivo, 128) || null;
    const capturaId = cleanStr(body.captura_id, 64);

    // creado_en: ISO válida, no futura (>5 min de skew) ni anterior a 2000-01-01.
    const vd = validDate(body.creado_en);
    if (vd === undefined) {
      await registrarImportacion({ archivoHash, dispositivo, errores: 1, detalle: 'creado_en inválido' });
      return bad(res, 'creado_en: fecha inválida');
    }
    let createdIso = new Date().toISOString();
    let baseTs = Date.now();
    if (vd) {
      const ms = Date.parse(vd);
      if (ms > Date.now() + SKEW_FUTURO_MS) {
        await registrarImportacion({ archivoHash, dispositivo, errores: 1, detalle: 'creado_en futuro' });
        return bad(res, 'creado_en no puede estar en el futuro');
      }
      if (ms < MIN_CAPTURA_MS) {
        await registrarImportacion({ archivoHash, dispositivo, errores: 1, detalle: 'creado_en anterior a 2000' });
        return bad(res, 'creado_en anterior a 2000-01-01');
      }
      createdIso = new Date(ms).toISOString();
      baseTs = ms;
    }

    // Idempotencia a nivel de aplicación: si captura_id ya existe, NO se inserta.
    if (capturaId) {
      const dup = await db.get('SELECT id FROM inspecciones WHERE captura_id = ? LIMIT 1', [capturaId]);
      if (dup) {
        await registrarImportacion({ archivoHash, dispositivo, duplicados: 1, detalle: `duplicado captura_id=${capturaId}` });
        return res.status(200).json({ duplicado: true, captura_id: capturaId });
      }
    }

    const inspectorUsername = cleanStr(body.inspector_username, 64);
    const r = await registrarInspeccion({
      body,
      user: req.user,
      opciones: { createdIso, capturaId, origen: 'campo', baseTs, importacion: true, inspectorUsername }
    });

    if (r.status !== 201) {
      await registrarImportacion({ archivoHash, dispositivo, errores: 1, detalle: cleanStr(r.payload && r.payload.msg, 500) });
      return res.status(r.status).json(r.payload);
    }

    await registrarImportacion({ archivoHash, dispositivo, creados: 1, detalle: `importado ${r.payload.tag}` });
    res.status(201).json({
      id: r.payload.id,
      tag: r.payload.tag,
      fecha: r.payload.fecha,
      proximo_vencimiento: r.payload.proximo_vencimiento,
      criticas: r.payload.criticas,
      rechazado: r.payload.rechazado,
      duplicado: false
    });
    emitirEventos(r.eventos);
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