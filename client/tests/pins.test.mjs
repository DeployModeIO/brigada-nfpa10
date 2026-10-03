import { test } from 'node:test'
import assert from 'node:assert/strict'

const { pinsDe, filtrarPins, areasDe, colorDe, areaDe } = await import('./.build/pins.mjs')

const items = [
  { tag: 'E-1', ubicacion: 'Nave A (pilar 2)', estadoCalculado: 'vigente', lat: -0.18, lng: -78.46, capacidad_l: 6, metadata: null },
  { tag: 'E-2', ubicacion: 'Nave A — columna 4', estadoCalculado: 'vencido', lat: -0.182, lng: -78.462, capacidad_l: 12, metadata: null },
  { tag: 'E-3', ubicacion: 'Cocina', estadoCalculado: 'rechazado', lat: null, lng: null, capacidad_l: 4, metadata: null },
]

test('pinsDe: 3 fixtures → verde/rojo/negro con coordenadas y grilla determinista', () => {
  const pins = pinsDe(items)
  assert.equal(pins.length, 3)
  const porTag = Object.fromEntries(pins.map((p) => [p.tag, p]))
  assert.ok(porTag['E-1'].x >= 8 && porTag['E-1'].x <= 92 && porTag['E-1'].y >= 8 && porTag['E-1'].y <= 92, 'coordenadas en viewBox')
  assert.equal(porTag['E-1'].estado, 'vigente')
  assert.equal(porTag['E-2'].estado, 'vencido')
  assert.equal(porTag['E-3'].estado, 'rechazado')
  // sin lat/lng → grilla determinista (mismo input, mismo output)
  const otra = pinsDe(items)
  assert.deepEqual(otra, pins)
})

test('Criterio 6: color por estado = tokens (var(--ok)/warn/err/text), nunca hex en el componente', () => {
  assert.equal(colorDe('vigente'), 'var(--ok)')
  assert.equal(colorDe('por_vencer'), 'var(--warn)')
  assert.equal(colorDe('vencido'), 'var(--err)')
  assert.equal(colorDe('rechazado'), 'var(--text)')
  assert.match(colorDe('sin_inspeccionar'), /^var\(--text2\)$/)
})

test('areaDe + filtro por área y estado (nave/columna del maestro)', () => {
  assert.equal(areaDe({ ubicacion: 'Nave A (pilar 2)' }), 'Nave A')
  assert.equal(areaDe({ ubicacion: 'Nave A — columna 4' }), 'Nave A')
  assert.equal(areaDe({ ubicacion: 'x', metadata: { area: 'Patio' } }), 'Patio')
  assert.deepEqual(areasDe(items), ['Cocina', 'Nave A'])
  assert.equal(filtrarPins(items, 'Nave A', '').length, 2)
  assert.equal(filtrarPins(items, '', 'rechazado').length, 1)
  assert.equal(filtrarPins(items, 'Nave A', 'vencido')[0].tag, 'E-2')
})
