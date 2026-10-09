/**
 * Tests PUROS del mapa real /planta (Leaflet+OSM): filtrado de coordenadas, armado de
 * puntos, deep-link a Google Maps, etiquetas y escapado. Bundle generado en test:build.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { coordValida, puntoGeoDe, puntosGeoDe, sinCoordenadas, mapsUrlPara, etiquetaEstado, escaparHtml } =
  await import('./.build/mapaGeo.mjs')

const items = [
  { tag: 'E-2', ubicacion: 'Nave A — columna 4', estadoCalculado: 'vencido', lat: -0.182, lng: -78.462 },
  { tag: 'E-1', ubicacion: 'Nave A (pilar 2)', estadoCalculado: 'vigente', lat: -0.18, lng: -78.46 },
  { tag: 'E-3', ubicacion: 'Cocina', estadoCalculado: 'rechazado', lat: null, lng: null },
  { tag: 'E-4', ubicacion: 'Patio', estadoCalculado: 'sin_inspeccionar', lat: NaN, lng: -78.4 },
]

test('coordValida: acepta finitos en rango y descarta null/NaN/Infinity/fuera de rango', () => {
  assert.equal(coordValida(-0.18, -78.46), true)
  assert.equal(coordValida('12.5', '-70'), true)
  assert.equal(coordValida(null, -78), false)
  assert.equal(coordValida(NaN, -78), false)
  assert.equal(coordValida(0, Infinity), false)
  assert.equal(coordValida(91, 0), false)
  assert.equal(coordValida(0, 181), false)
})

test('puntoGeoDe: construye el punto; null si faltan coordenadas', () => {
  assert.deepEqual(puntoGeoDe(items[0]), {
    tag: 'E-2', lat: -0.182, lng: -78.462, estado: 'vencido', ubicacion: 'Nave A — columna 4',
  })
  assert.equal(puntoGeoDe(items[2]), null)
})

test('puntosGeoDe: solo equipos con coordenadas válidas, ordenados por tag', () => {
  const pts = puntosGeoDe(items)
  assert.deepEqual(pts.map((p) => p.tag), ['E-1', 'E-2'])
  assert.equal(pts[0].lat, -0.18)
  assert.match(pts[0].estado, /vigente/)
  // determinista
  assert.deepEqual(puntosGeoDe(items), pts)
})

test('sinCoordenadas: cuenta los equipos que NO se pueden pintar', () => {
  assert.equal(sinCoordenadas(items), 2)
  assert.equal(sinCoordenadas(puntosGeoDe(items)), 0)
})

test('mapsUrlPara: deep-link a Google Maps con lat,lng', () => {
  assert.equal(mapsUrlPara(-0.18, -78.46), 'https://www.google.com/maps?q=-0.18,-78.46')
})

test('etiquetaEstado: semáforo → texto humano (desconocido = sin inspeccionar)', () => {
  assert.equal(etiquetaEstado('vigente'), 'Vigente')
  assert.equal(etiquetaEstado('por_vencer'), 'Por vencer')
  assert.equal(etiquetaEstado('vencido'), 'Vencido')
  assert.equal(etiquetaEstado('rechazado'), 'Rechazado (NO APTO)')
  assert.equal(etiquetaEstado('otra_cosa'), 'Sin inspeccionar')
})

test('escaparHtml: neutraliza < > " \' &', () => {
  assert.equal(escaparHtml('<b>"x"&\'y\'</b>'), '&lt;b&gt;&quot;x&quot;&amp;&#39;y&#39;&lt;/b&gt;')
  assert.equal(escaparHtml(null), '')
})