'use strict';
// Unit de la lista de reemplazo (criterio 9): agrupa por área, ordena por urgencia, escapa comas.
const test = require('node:test');
const assert = require('node:assert/strict');
const { csvCell, areaDe, filasReemplazo, construirCsv } = require('../src/lib/reemplazos');

const NOW = Date.parse('2026-06-15T00:00:00Z');
const d = (days) => new Date(NOW + days * 86400000).toISOString();

const panel = {
  rojo: [
    { tag: 'V-1', ubicacion: 'Laboratorio (vencido)', tipo: 'PQS', capacidad_l: 6, proximo_vencimiento: d(-3), estadoCalculado: 'vencido' },
    { tag: 'V-2', ubicacion: 'Laboratorio (vencido)', tipo: 'CO2', capacidad_l: 4, proximo_vencimiento: d(-10), estadoCalculado: 'vencido' },
    { tag: 'V-3', ubicacion: 'Bodega, estantería 4 (vencido)', tipo: 'PQS', capacidad_l: 9, proximo_vencimiento: d(-1), estadoCalculado: 'vencido' }
  ],
  negro: [
    { tag: 'N-1', ubicacion: 'Laboratorio (rechazado)', tipo: 'BC', capacidad_l: 2, proximo_vencimiento: d(20), estadoCalculado: 'rechazado' }
  ]
};

test('csvCell escapa comas y comillas', () => {
  assert.equal(csvCell('a,b'), '"a,b"');
  assert.equal(csvCell('di"jo'), '"di""jo"');
  assert.equal(csvCell('ok'), 'ok');
});

test('areaDe toma el prefijo antes de " (" y metadata.area/nave', () => {
  assert.equal(areaDe({ ubicacion: 'Laboratorio (x)' }), 'Laboratorio');
  assert.equal(areaDe({ ubicacion: 'Bodega, estantería 4 (v)' }), 'Bodega, estantería 4');
  assert.equal(areaDe({ ubicacion: 'z', metadata: { area: 'Nave A' } }), 'Nave A');
  assert.equal(areaDe({ ubicacion: 'z', metadata: { ubicacion_detalle: { nave: 'Nave B' } } }), 'Nave B');
});

test('filasReemplazo: agrupa por área, rechazados primero, más mora primero', () => {
  const filas = filasReemplazo(panel, NOW);
  assert.equal(filas[0].tag, 'N-1', 'rechazado lidera su área');
  assert.equal(filas[1].tag, 'V-2', 'mayor mora primero en Laboratorio');
  assert.equal(filas[2].tag, 'V-1');
  // Laboratorio tiene rechazado ⇒ el área va primero; Bodega después.
  assert.ok(filas.findIndex((f) => f.tag === 'V-3') > 2, 'área con solo vencidos va después');
});

test('construirCsv: cabecera + coma escapada dentro del campo', () => {
  const csv = construirCsv(panel, NOW);
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'area,tag,ubicacion,tipo,capacidad_l,proximo_vencimiento,motivo,dias_mora');
  assert.ok(lines.some((l) => l.startsWith('"Bodega, estantería 4",V-3,"Bodega, estantería 4 (vencido)"')), lines[3]);
});
