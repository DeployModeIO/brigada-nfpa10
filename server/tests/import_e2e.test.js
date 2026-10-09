'use strict';
// E2E del ciclo completo de terreno (store-and-forward), a nivel de API:
//   export lote (brigada.export/v1 tal como lo genera src/features/terreno/exportarLote.ts)
//   → POST /inspections/import ítem a ítem (como hace la pantalla admin)
//   → la BD del PC refleja la inspección de campo (fecha fiel, vencimiento anclado, rechazo)
//   → reimportar el MISMO lote es idempotente (duplicado:true, sin filas nuevas).
// Bootea la app contra una sqlite temporal, igual que server/tests/importacion.test.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brigada-e2e-'));
Object.assign(process.env, {
  DB_DRIVER: 'sqlite',
  DB_PATH: path.join(tmp, 'e2e.db'),
  NODE_ENV: 'test',
  AUTH_SECRET: 'test-secret'
});

const db = require('../src/db');
const { runSeed } = require('../seeds/seed');

const DIA_MS = 86400000;
let server = null;
let BASE = null;

async function boot() {
  if (server) return;
  await runSeed();
  const { buildApp } = require('../src/app');
  server = buildApp().listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  BASE = `http://127.0.0.1:${server.address().port}/api/v1`;
}

async function api(p, opts = {}, token) {
  await boot();
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const r = await fetch(`${BASE}${p}`, { ...opts, headers });
  return { status: r.status, body: await r.json().catch(() => null) };
}

let _admin = null;
async function adminToken() {
  if (_admin) return _admin;
  await boot();
  const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ username: 'admin', password: 'Br1g@d4!n' }) });
  _admin = r.body.token;
  return _admin;
}

/** Claves del checklist con su marca de crítico (para construir resultados de terreno). */
async function checklistClaves() {
  return db.all('SELECT clave, critico FROM checklist_items WHERE activo = 1 ORDER BY orden, id');
}

/** Todas las claves en true salvo las que se indiquen en `falsas`. */
function resultadosDesde(claves, falsas = []) {
  const r = {};
  const set = new Set(falsas);
  for (const c of claves) r[c.clave] = !set.has(c.clave);
  return r;
}

/**
 * Construye un lote EXACTAMENTE con la forma que produce exportarLote.ts (construirExport):
 * schema brigada.export/v1 + manifest + items[{captura_id, creado_en, tag, resultados,
 * observaciones, foto_evidencia_base64, gps, dispositivo}].
 */
function construirLote(colaItems, opts) {
  const items = colaItems.map((it) => ({
    captura_id: it.captura_id,
    creado_en: it.creado_en,
    tag: it.tag,
    resultados: it.resultados ?? {},
    observaciones: it.observaciones ?? null,
    foto_evidencia_base64: opts.incluirFotos ? it.foto_evidencia_base64 ?? null : null,
    gps: it.gps ?? null,
    dispositivo: it.dispositivo ?? null
  }));
  return {
    schema: 'brigada.export/v1',
    generado_en: new Date().toISOString(),
    dispositivo: opts.dispositivo,
    inspector_username: opts.inspectorUsername,
    app_version: opts.appVersion,
    total: items.length,
    items
  };
}

/** Como construirPayloadImport + la pantalla admin: un POST por ítem con meta del lote. */
async function importarLote(lote, hash, token) {
  const out = [];
  for (const item of lote.items) {
    const payload = {
      tag: item.tag,
      resultados: item.resultados,
      captura_id: item.captura_id,
      creado_en: item.creado_en,
      observaciones: item.observaciones,
      foto_evidencia_base64: item.foto_evidencia_base64,
      gps: item.gps,
      dispositivo: item.dispositivo,
      inspector_username: lote.inspector_username,
      meta: { archivo_hash: hash, dispositivo: lote.dispositivo }
    };
    const r = await api('/inspections/import', { method: 'POST', body: JSON.stringify(payload) }, token);
    out.push({ item, http: r.status, body: r.body });
  }
  return out;
}

test.after(async () => {
  if (server) await new Promise((r) => server.close(r));
  await db.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (_) { /* nada */ }
});

test('ciclo completo: export de terreno → import fiel en el PC → reimport idempotente', async () => {
  const admin = await adminToken();
  const claves = await checklistClaves();
  assert.ok(claves.length > 0, 'el seed cargó checklist');
  const critica = claves.find((c) => Number(c.critico) === 1);
  assert.ok(critica, 'hay al menos una clave crítica (rechazo)');

  // Capturas de hace ~10 días (determinista por offset respecto al reloj del PC).
  const creado = new Date(Date.now() - 10 * DIA_MS).toISOString();
  const TAG_OK = 'EXTF-COC-021';
  const TAG_CRIT = 'EXTF-ALM-022';

  const lote = construirLote([
    {
      captura_id: 'cap-e2e-ok-0001',
      creado_en: creado,
      tag: TAG_OK,
      resultados: resultadosDesde(claves),
      observaciones: 'todo conforme',
      gps: { lat: -0.1833, lng: -78.4683 },
      dispositivo: 'android-campo-01'
    },
    {
      captura_id: 'cap-e2e-crit-0002',
      creado_en: creado,
      tag: TAG_CRIT,
      resultados: resultadosDesde(claves, [critica.clave]),
      observaciones: `falla crítica en ${critica.clave}`,
      foto_evidencia_base64: 'AAECAw==',
      gps: { lat: -0.184, lng: -78.469 },
      dispositivo: 'android-campo-01'
    }
  ], { inspectorUsername: 'inspector', dispositivo: 'android-campo-01', appVersion: '0.2.0', incluirFotos: true });

  assert.equal(lote.schema, 'brigada.export/v1');
  assert.equal(lote.total, 2);
  assert.equal(lote.items.length, 2);

  const hash = 'e2e-lote-0001';
  const primera = await importarLote(lote, hash, admin);

  // --- ítem 1: inspección conforme -------------------------------------------------
  const ok = primera[0];
  assert.equal(ok.http, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.duplicado, false);
  assert.equal(ok.body.rechazado, false);
  assert.equal(ok.body.fecha, creado, 'respuesta conserva la fecha de captura');
  assert.equal(ok.body.proximo_vencimiento, new Date(Date.parse(creado) + 30 * DIA_MS).toISOString(), 'vencimiento anclado a la captura');
  assert.notEqual(ok.body.proximo_vencimiento, new Date(Date.now() + 30 * DIA_MS).toISOString(), 'NO anclado al reloj del PC');

  const extOk = await db.get('SELECT ultima_inspeccion, proximo_vencimiento, estado_inspeccion, rechazado FROM extintores WHERE tag = ?', [TAG_OK]);
  assert.equal(extOk.ultima_inspeccion, creado, 'extintores refleja la captura de campo');
  assert.equal(extOk.proximo_vencimiento, new Date(Date.parse(creado) + 30 * DIA_MS).toISOString());
  assert.equal(extOk.estado_inspeccion, 'pasa');
  assert.equal(Number(extOk.rechazado), 0);

  const inspOk = await db.get('SELECT created_at, captura_id, origen, inspector_username FROM inspecciones WHERE captura_id = ?', ['cap-e2e-ok-0001']);
  assert.ok(inspOk, 'la inspección quedó persistida');
  assert.equal(inspOk.created_at, creado, 'created_at = creado_en del teléfono');
  assert.equal(inspOk.captura_id, 'cap-e2e-ok-0001');
  assert.equal(inspOk.origen, 'campo');
  assert.equal(inspOk.inspector_username, 'inspector', 'se resuelve el inspector original del terreno');

  // --- ítem 2: falla crítica ⇒ rechazado ------------------------------------------
  const crit = primera[1];
  assert.equal(crit.http, 201, JSON.stringify(crit.body));
  assert.equal(crit.body.rechazado, true, 'la falla crítica rechaza el extintor');
  assert.ok(crit.body.criticas.includes(critica.clave), 'la crítica reportada es la del terreno');
  assert.equal(crit.body.fecha, creado);

  const extCrit = await db.get('SELECT ultima_inspeccion, proximo_vencimiento, estado_inspeccion, rechazado FROM extintores WHERE tag = ?', [TAG_CRIT]);
  assert.equal(extCrit.ultima_inspeccion, creado);
  assert.equal(extCrit.proximo_vencimiento, new Date(Date.parse(creado) + 30 * DIA_MS).toISOString());
  assert.equal(extCrit.estado_inspeccion, 'falla');
  assert.equal(Number(extCrit.rechazado), 1);

  const inspCrit = await db.get('SELECT created_at, captura_id, origen FROM inspecciones WHERE captura_id = ?', ['cap-e2e-crit-0002']);
  assert.equal(inspCrit.created_at, creado);
  assert.equal(inspCrit.captura_id, 'cap-e2e-crit-0002');
  assert.equal(inspCrit.origen, 'campo');

  // --- reimport del MISMO lote: idempotente ----------------------------------------
  const antes = Number((await db.get('SELECT COUNT(*) AS c FROM inspecciones')).c);
  const segunda = await importarLote(lote, hash, admin);
  for (const r of segunda) {
    assert.equal(r.body.duplicado, true, `duplicado:true para ${r.item.captura_id}`);
    assert.equal(r.http, 200);
    assert.equal(r.body.captura_id, r.item.captura_id);
  }
  const despues = Number((await db.get('SELECT COUNT(*) AS c FROM inspecciones')).c);
  assert.equal(despues, antes, 'reimportar no crea filas nuevas');

  const extOk2 = await db.get('SELECT ultima_inspeccion, rechazado FROM extintores WHERE tag = ?', [TAG_OK]);
  assert.equal(extOk2.ultima_inspeccion, creado, 'la reimportación no altera el extintor');
  assert.equal(Number(extOk2.rechazado), 0);

  // Contadores agregados del lote (trazabilidad del archivo importado).
  const agg = await db.get('SELECT total, creados, duplicados FROM importaciones WHERE archivo_hash = ?', [hash]);
  assert.ok(agg, 'se registró la importación por hash');
  assert.equal(Number(agg.total), 4, '2 ítems × 2 pasadas');
  assert.equal(Number(agg.creados), 2);
  assert.equal(Number(agg.duplicados), 2);
});
