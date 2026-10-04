'use strict';
// Webhooks hacia el sistema de la empresa (ej. n8n). Fail-silent con log.
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const db = require('../db');
const { estadoCalculado } = require('./estado');
const nfpa = require('./nfpa');

function log(...args) { console.log(`[${new Date().toISOString()}]`, ...args); }

async function getSetting(key) {
  const r = await db.get('SELECT svalue FROM settings WHERE skey = ?', [key]);
  return r && r.svalue != null ? r.svalue : null;
}

async function setSetting(key, value) {
  const exists = await db.get('SELECT skey FROM settings WHERE skey = ?', [key]);
  if (exists) await db.run('UPDATE settings SET svalue = ? WHERE skey = ?', [value, key]);
  else await db.run('INSERT INTO settings (skey, svalue) VALUES (?, ?)', [key, value]);
}

function postJson(url, payload, apiKey) {
  return new Promise((resolve) => {
    let u;
    try { u = new URL(url); } catch (e) { return resolve({ ok: false, status: 0, error: 'URL inválida' }); }
    const mod = u.protocol === 'https:' ? https : http;
    const body = JSON.stringify(payload);
    const req = mod.request(
      {
        method: 'POST',
        hostname: u.hostname,
        port: u.port || (u.protocol === 'https:' ? 443 : 80),
        path: (u.pathname || '/') + (u.search || ''),
        headers: Object.assign(
          {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(body)
          },
          // X-API-Key SOLO cuando settings.webhookApi está configurado (n8n Header Auth).
          apiKey ? { 'X-API-Key': apiKey } : {}
        ),
        timeout: 5000
      },
      (res) => {
        res.on('data', () => {});
        res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, status: res.statusCode }));
      }
    );
    req.on('timeout', () => req.destroy(new Error('timeout 5s')));
    req.on('error', (e) => resolve({ ok: false, status: 0, error: e.message }));
    req.write(body);
    req.end();
  });
}

// POST {evento,data,ts} a settings.webhookUrl con header X-API-Key.
async function sendEvent(evento, data) {
  const url = await getSetting('webhookUrl');
  if (!url) return { ok: false, skipped: true, error: 'webhookUrl no configurado' };
  const apiKey = await getSetting('webhookApi');
  const r = await postJson(url, { evento, data, ts: new Date().toISOString() }, apiKey);
  if (!r.ok) log(`[webhook] fallo evento=${evento} url=${url}: ${r.error || 'HTTP ' + r.status}`);
  else log(`[webhook] ok evento=${evento} status=${r.status}`);
  return r;
}

// Job periódico: agrupa extintores vencidos y notifica solo si el conjunto cambia.
async function revisarVencidos() {
  const rows = await db.all('SELECT * FROM extintores WHERE activo = 1');
  const reglas = await nfpa.obtenerReglas();
  const vencidos = rows
    .filter((r) => estadoCalculado(r, Date.now(), reglas) === 'vencido')
    .map((r) => {
      const det = nfpa.estadoNfpa(r, reglas);
      return { tag: r.tag, ubicacion: r.ubicacion, tipo: r.tipo, proximo_vencimiento: r.proximo_vencimiento, motivo: det.motivo, vence_en: det.venceEn };
    })
    .sort((a, b) => (a.tag < b.tag ? -1 : 1));
  if (!vencidos.length) return;
  const hash = crypto.createHash('sha256').update(vencidos.map((v) => v.tag).join(',')).digest('hex');
  const last = await getSetting('webhook_last_vencidos_hash');
  if (last === hash) return;
  await setSetting('webhook_last_vencidos_hash', hash);
  await sendEvent('vencidos_detectados', { total: vencidos.length, vencidos });
}

function startWebhookJob(intervalMs) {
  const t = setInterval(() => {
    revisarVencidos().catch((e) => log('[webhook] job error:', e.message));
  }, intervalMs);
  t.unref();
  return t;
}

module.exports = { sendEvent, revisarVencidos, startWebhookJob, getSetting, setSetting };
