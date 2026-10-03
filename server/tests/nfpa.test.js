'use strict';
// Unit del motor NFPA 10 (criterio 4): fechas 100 % inyectables.
const test = require('node:test');
const assert = require('node:assert/strict');
const nfpa = require('../src/lib/nfpa');

const NOW = Date.parse('2026-06-15T12:00:00Z');
const { DIA_MS, ANIO_MS, MES_MS } = nfpa;
const base = { rechazado: 0, ultima_inspeccion: new Date(NOW - 5 * DIA_MS).toISOString() };

function ext(over) { return { ...base, ...over }; }

test('PQS: fabricada hace 11.94 a ⇒ por_vencer (amarillo ≤30 d de la hidrostática)', () => {
  const e = ext({ agente: 'PQS', fecha_fabricacion: new Date(NOW - (12 * ANIO_MS - 22 * DIA_MS)).toISOString(), proximo_vencimiento: new Date(NOW + 25 * DIA_MS).toISOString() });
  assert.equal(nfpa.estadoNfpa(e, null, NOW).estado, 'por_vencer');
  assert.equal(nfpa.estadoNfpa(e, null, NOW).motivo, 'hidrostatica');
});

test('PQS: fabricada hace 12.1 a ⇒ vencido', () => {
  const e = ext({ agente: 'PQS', fecha_fabricacion: new Date(NOW - 12.1 * ANIO_MS).toISOString(), proximo_vencimiento: new Date(NOW + 25 * DIA_MS).toISOString() });
  assert.equal(nfpa.estadoNfpa(e, null, NOW).estado, 'vencido');
});

test('CO2: a 5 años — 4.94 a ⇒ por_vencer; 5.1 a ⇒ vencido', () => {
  const y = ext({ agente: 'CO2', fecha_fabricacion: new Date(NOW - (5 * ANIO_MS - 20 * DIA_MS)).toISOString(), proximo_vencimiento: new Date(NOW + 25 * DIA_MS).toISOString() });
  const r = ext({ agente: 'CO2', fecha_fabricacion: new Date(NOW - 5.1 * ANIO_MS).toISOString(), proximo_vencimiento: new Date(NOW + 25 * DIA_MS).toISOString() });
  assert.equal(nfpa.estadoNfpa(y, null, NOW).estado, 'por_vencer');
  assert.equal(nfpa.estadoNfpa(r, null, NOW).estado, 'vencido');
});

test('AGUA usa 5 años como CO2', () => {
  const e = ext({ agente: 'AGUA', fecha_fabricacion: new Date(NOW - 5.1 * ANIO_MS).toISOString(), proximo_vencimiento: new Date(NOW + 20 * DIA_MS).toISOString() });
  assert.equal(nfpa.estadoNfpa(e, null, NOW).estado, 'vencido');
});

test('inspección mensual usa ventana ≤7 d y manda si es más próxima', () => {
  const e = ext({ agente: 'PQS', fecha_fabricacion: new Date(NOW - 1 * ANIO_MS).toISOString(), proximo_vencimiento: new Date(NOW + 5 * DIA_MS).toISOString() });
  assert.equal(nfpa.estadoNfpa(e, null, NOW).estado, 'por_vencer');
  assert.equal(nfpa.estadoNfpa(e, null, NOW).motivo, 'inspeccion_mensual');
});

test('recarga 12 meses: última recarga hace 11.94 a ⇒ por_vencer (≤30 d)', () => {
  const e = ext({ agente: 'PQS', proximo_vencimiento: new Date(NOW + 25 * DIA_MS).toISOString(), ultima_recarga: new Date(NOW - (12 * MES_MS - 20 * DIA_MS)).toISOString() });
  assert.equal(nfpa.estadoNfpa(e, null, NOW).estado, 'por_vencer');
  assert.equal(nfpa.estadoNfpa(e, null, NOW).motivo, 'recarga_taller');
});

test('rechazado manda sobre cualquier vencimiento', () => {
  const e = ext({ rechazado: 1, agente: 'PQS', fecha_fabricacion: new Date(NOW - 20 * ANIO_MS).toISOString() });
  assert.equal(nfpa.estadoNfpa(e, null, NOW).estado, 'rechazado');
});

test('sin inspección ⇒ sin_inspeccionar (aunque la fabricación esté vieja)', () => {
  const e = { rechazado: 0, agente: 'CO2', fecha_fabricacion: new Date(NOW - 9 * ANIO_MS).toISOString(), ultima_inspeccion: null, proximo_vencimiento: null };
  assert.equal(nfpa.estadoNfpa(e, null, NOW).estado, 'sin_inspeccionar');
});

test('reglas custom: hidro_anios=8 para PQS cambia el resultado (reglas son DATOS)', () => {
  const fab = new Date(NOW - 8.1 * ANIO_MS).toISOString();
  const e = ext({ agente: 'PQS', fecha_fabricacion: fab, proximo_vencimiento: new Date(NOW + 25 * DIA_MS).toISOString() });
  assert.equal(nfpa.estadoNfpa(e, null, NOW).estado, 'vigente');
  const custom = { '*': { ...nfpa.REGLAS_BASE }, PQS: { ...nfpa.REGLAS_BASE, hidro_anios: 8 } };
  assert.equal(nfpa.estadoNfpa(e, custom, NOW).estado, 'vencido');
});

test('venc_hidro explícito manda sobre la fecha de fabricación', () => {
  const e = ext({ agente: 'PQS', fecha_fabricacion: new Date(NOW - 2 * ANIO_MS).toISOString(), venc_hidro: new Date(NOW - DIA_MS).toISOString(), proximo_vencimiento: new Date(NOW + 25 * DIA_MS).toISOString() });
  assert.equal(nfpa.estadoNfpa(e, null, NOW).estado, 'vencido');
});

test('agenteDe: derive desde tipo clásico si falta la columna', () => {
  assert.equal(nfpa.agenteDe({ tipo: 'ABC' }), 'PQS');
  assert.equal(nfpa.agenteDe({ tipo: 'PW' }), 'AGUA');
  assert.equal(nfpa.agenteDe({ tipo: 'x', agente: 'co2' }), 'CO2');
});
