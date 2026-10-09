import { test } from 'node:test'
import assert from 'node:assert/strict'

const { construirExport, nombreArchivoExport, esModoCaptura } = await import('./.build/exportarlote.mjs')

function colaItem(payload, extra = {}) {
  return {
    payload,
    estado: 'pending',
    intentos: 0,
    siguiente_en: Date.now(),
    creado_en: Date.now(),
    ...extra,
  }
}

test('esModoCaptura: solo "local" activa el modo', () => {
  assert.equal(esModoCaptura('local'), true)
  assert.equal(esModoCaptura('LOCAL'), false)
  assert.equal(esModoCaptura('demo'), false)
  assert.equal(esModoCaptura(''), false)
  assert.equal(esModoCaptura(undefined), false)
})

test('construirExport: manifest, total e items completos', () => {
  const items = [
    colaItem({
      tag: 'E-1',
      resultados: { presion_rango: false, precinto_intacto: true },
      captura_id: 'cap-1',
      creado_en: '2026-01-02T03:04:05.000Z',
      observaciones: 'manómetro bajo',
      foto_evidencia_base64: 'AAAA',
      gps: { lat: -0.18, lng: -78.46 },
      dispositivo: 'android-1',
    }),
    colaItem({ tag: 'E-2', resultados: { precinto_intacto: true }, captura_id: 'cap-2', creado_en: '2026-01-02T04:00:00.000Z' }),
  ]
  const lote = construirExport(items, {
    inspectorUsername: 'jperez',
    dispositivo: 'android-field',
    appVersion: '0.1.0',
    incluirFotos: true,
  })
  assert.equal(lote.schema, 'brigada.export/v1')
  assert.equal(lote.total, 2)
  assert.equal(lote.items.length, 2)
  assert.equal(lote.inspector_username, 'jperez')
  assert.equal(lote.dispositivo, 'android-field')
  assert.equal(lote.app_version, '0.1.0')
  assert.match(lote.generado_en, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/)
  assert.equal(lote.items[0].captura_id, 'cap-1')
  assert.equal(lote.items[0].creado_en, '2026-01-02T03:04:05.000Z')
  assert.equal(lote.items[0].tag, 'E-1')
  assert.deepEqual(lote.items[0].resultados, { presion_rango: false, precinto_intacto: true })
  assert.equal(lote.items[0].observaciones, 'manómetro bajo')
  assert.equal(lote.items[0].foto_evidencia_base64, 'AAAA')
  assert.deepEqual(lote.items[0].gps, { lat: -0.18, lng: -78.46 })
  assert.equal(lote.items[0].dispositivo, 'android-1')
})

test('incluirFotos=false descarta la evidencia fotográfica', () => {
  const items = [colaItem({ tag: 'E-1', resultados: {}, foto_evidencia_base64: 'ZZZ' })]
  const lote = construirExport(items, {
    inspectorUsername: 'u',
    dispositivo: 'd',
    appVersion: '1',
    incluirFotos: false,
  })
  assert.equal(lote.items[0].foto_evidencia_base64, null)
})

test('fallbacks: captura_id generado y creado_en desde la fecha de encolado', () => {
  const creado = Date.parse('2026-05-06T07:08:09.000Z')
  const items = [colaItem({ tag: 'E-1', resultados: { a: true } }, { creado_en: creado })]
  const lote = construirExport(items, {
    inspectorUsername: 'u',
    dispositivo: 'd',
    appVersion: '1',
    incluirFotos: true,
  })
  assert.equal(typeof lote.items[0].captura_id, 'string')
  assert.ok(lote.items[0].captura_id.length > 0)
  assert.equal(lote.items[0].creado_en, '2026-05-06T07:08:09.000Z')
  // observaciones/gps/dispositivo ausentes → null (esquema estable)
  assert.equal(lote.items[0].observaciones, null)
  assert.equal(lote.items[0].gps, null)
  assert.equal(lote.items[0].dispositivo, null)
})

test('nombreArchivoExport: brigada-terreno-YYYYMMDD-HHmm.json', () => {
  const n = nombreArchivoExport(new Date(2026, 0, 2, 3, 4))
  assert.equal(n, 'brigada-terreno-20260102-0304.json')
  assert.match(nombreArchivoExport(), /^brigada-terreno-\d{8}-\d{4}\.json$/)
})