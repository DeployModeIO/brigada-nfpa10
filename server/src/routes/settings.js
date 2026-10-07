'use strict';
const express = require('express');
const db = require('../db');
const { auth, requireRole } = require('../middleware/auth');
const { bad, cleanStr, COLOR_RE, URL_RE } = require('../middleware/validate');

const router = express.Router();

const DEFAULTS = {
  appName: 'BRIGADA O&G',
  jefeBrigada: '',
  logoDataUrl: '',
  temaDefault: 'light',
  webhookUrl: '',
  webhookApi: '',
  // Mapa geográfico opcional (V2.1 O&G): OpenStreetMap sin API key. Vacío = plano SVG offline.
  mapTileUrl: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  brand: { primary: '#0ea5e9', ok: '#22c55e', warn: '#eab308', err: '#ef4444', info: '#3b82f6' },
  configTipos: [],
  configUbicaciones: [],
  // Catálogo de hallazgos de terreno (DEC V2.1 O&G): NFPA 10 §7.2/§7.3 + API RP 14G.
  // Editable por el admin (PATCH /settings, clave configHallazgos).
  configHallazgos: [
    'Sello o precinto de seguridad roto o ausente',
    'Manómetro en zona roja (presión baja)',
    'Manómetro en zona roja (sobrepresión)',
    'Manómetro dañado, vencido o ilegible',
    'Prueba de presión (hidrostática) vencida',
    'Recarga de agente vencida (+12 meses)',
    'Óxido o corrosión visible en el cuerpo',
    'Abolladuras o golpes en el cilindro',
    'Manguera fisurada, cortada o endurecida',
    'Tobera o difusor obstruido o faltante',
    'Válvula con fuga o dañada',
    'Pasador de seguridad ausente',
    'Agente compactado o apelmazado (PQS)',
    'Tarjeta/etiqueta de inspección ilegible',
    'Señalización del equipo ausente o ilegible',
    'Acceso al equipo obstruido',
    'Soporte flojo, ausente o fuera de altura',
    'Tipo de extintor incorrecto para el riesgo',
    'Cuerpo repintado (pintura no de fábrica)',
    'SCBA con carga de cilindro insuficiente'
  ]
};

const SCALAR_KEYS = ['appName', 'jefeBrigada', 'logoDataUrl', 'temaDefault', 'webhookUrl', 'webhookApi'];
const BRAND_KEYS = ['primary', 'ok', 'warn', 'err', 'info'];
const LIST_KEYS = ['configTipos', 'configUbicaciones', 'configHallazgos'];

async function loadSettings() {
  const rows = await db.all('SELECT skey, svalue FROM settings');
  const map = {};
  for (const r of rows) map[r.skey] = r.svalue;
  const s = JSON.parse(JSON.stringify(DEFAULTS));
  for (const k of SCALAR_KEYS) {
    if (map[k] !== undefined && map[k] !== '') s[k] = map[k];
  }
  if (map.logoDataUrl !== undefined) s.logoDataUrl = map.logoDataUrl; // permite limpiarlo a ''
  if (map.mapTileUrl !== undefined) s.mapTileUrl = map.mapTileUrl; // permite vacío = plano offline
  for (const b of BRAND_KEYS) {
    const v = map[`brand.${b}`];
    if (v !== undefined && v !== '') s.brand[b] = v;
  }
  for (const lk of LIST_KEYS) {
    if (map[lk] !== undefined && map[lk] !== '') {
      try {
        const arr = JSON.parse(map[lk]);
        if (Array.isArray(arr)) s[lk] = arr.filter((v) => typeof v === 'string');
      } catch (_) { /* valor corrupto: mantener default [] */ }
    }
  }
  return s;
}

async function upsertSetting(key, value) {
  const exists = await db.get('SELECT skey FROM settings WHERE skey = ?', [key]);
  if (exists) await db.run('UPDATE settings SET svalue = ? WHERE skey = ?', [value, key]);
  else await db.run('INSERT INTO settings (skey, svalue) VALUES (?, ?)', [key, value]);
}

router.get('/settings', auth, requireRole('admin'), async (req, res, next) => {
  try {
    res.json(await loadSettings());
  } catch (e) { next(e); }
});

router.patch('/settings', auth, requireRole('admin'), async (req, res, next) => {
  try {
    const body = req.body || {};
    const unknown = Object.keys(body).filter((k) => !SCALAR_KEYS.includes(k) && k !== 'brand' && !LIST_KEYS.includes(k));
    if (unknown.length) return bad(res, `Claves no permitidas: ${unknown.join(', ')}`);
    const updates = {};

    if (body.appName !== undefined) {
      const v = cleanStr(body.appName, 80);
      if (!v) return bad(res, 'appName inválido');
      updates.appName = v;
    }
    if (body.jefeBrigada !== undefined) {
      const v = cleanStr(body.jefeBrigada, 120)
      if (v === null) { updates.jefeBrigada = '' } else { updates.jefeBrigada = v }
    }
    if (body.logoDataUrl !== undefined) {
      const v = body.logoDataUrl === '' ? '' : String(body.logoDataUrl);
      if (v && !/^data:image\/(png|jpeg|jpg|webp|gif|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(v)) {
        return bad(res, 'logoDataUrl debe ser un data URL de imagen base64');
      }
      if (v.length > 1500000) return bad(res, 'logoDataUrl demasiado grande (máx 1.5M chars)');
      updates.logoDataUrl = v;
    }
    if (body.temaDefault !== undefined) {
      const v = cleanStr(body.temaDefault, 16);
      if (!['dark', 'light'].includes(v)) return bad(res, 'temaDefault debe ser dark o light');
      updates.temaDefault = v;
    }
    if (body.webhookUrl !== undefined) {
      const v = body.webhookUrl === '' ? '' : cleanStr(body.webhookUrl, 512);
      if (v && !URL_RE.test(v)) return bad(res, 'webhookUrl debe iniciar con http:// o https://');
      updates.webhookUrl = v;
    }
    if (body.webhookApi !== undefined) {
      updates.webhookApi = cleanStr(body.webhookApi, 256) || '';
    }
    if (body.mapTileUrl !== undefined) {
      const v = body.mapTileUrl === '' ? '' : cleanStr(body.mapTileUrl, 512);
      if (v && !/^https?:\/\//.test(v)) return bad(res, 'mapTileUrl debe ser vacío o una URL http(s)');
      updates.mapTileUrl = v;
    }
    if (body.brand !== undefined) {
      if (typeof body.brand !== 'object' || body.brand === null) return bad(res, 'brand debe ser un objeto');
      const extra = Object.keys(body.brand).filter((k) => !BRAND_KEYS.includes(k));
      if (extra.length) return bad(res, `brand: claves no permitidas: ${extra.join(', ')}`);
      for (const b of BRAND_KEYS) {
        if (body.brand[b] !== undefined) {
          if (!COLOR_RE.test(String(body.brand[b]))) return bad(res, `brand.${b} debe ser un color hex (#rgb, #rrggbb)`);
          updates[`brand.${b}`] = String(body.brand[b]);
        }
      }
    }

    for (const lk of LIST_KEYS) {
      if (body[lk] !== undefined) {
        if (!Array.isArray(body[lk])) return bad(res, `${lk} debe ser un array de strings`);
        if (body[lk].length > 100) return bad(res, `${lk} admite máximo 100 valores`);
        const arr = [];
        for (const v of body[lk]) {
          const clean = cleanStr(v, 80);
          if (!clean) return bad(res, `${lk} contiene un valor vacío o inválido`);
          if (!arr.includes(clean)) arr.push(clean);
        }
        updates[lk] = JSON.stringify(arr);
      }
    }

    for (const [k, v] of Object.entries(updates)) await upsertSetting(k, v);
    res.json(await loadSettings());
  } catch (e) { next(e); }
});

module.exports = { router, DEFAULTS, loadSettings, upsertSetting };
