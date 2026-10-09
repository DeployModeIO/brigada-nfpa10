import { test } from 'node:test'
import assert from 'node:assert/strict'

const { validarLoteExport, construirPayloadImport, resumirImportacion, hashArchivo } = await import(
  './.build/importarterreno.mjs'
)

const loteValido = {
  schema: 'brigada.export/v1',
  generado_en: '2026-01-02T03:04:05.000Z',
  dispositivo: 'android-field',
  inspector_username: 'jperez',
  app_version: '0.1.0',
  total: 2,
  items: [
    { captura_id: 'cap-1', creado_en: '2026-01-02T03:04:05.000Z', tag: 'E-1', resultados: { a: true } },
    { tag: 'E-2', resultados: { b: false } },
  ],
}

test('validarLoteExport: lote válido → ok con el lote intacto', () => {
  const r = validarLoteExport(loteValido)
  assert.equal(r.ok, true)
  assert.equal(r.lote.schema, 'brigada.export/v1')
  assert.equal(r.lote.items.length, 2)
  assert.equal(r.lote.items[0].tag, 'E-1')
})

test('validarLoteExport: esquema incorrecto → error claro', () => {
  const r = validarLoteExport({ ...loteValido, schema: 'otra.cosa/v1' })
  assert.equal(r.ok, false)
  assert.match(r.error, /esquema/i)
})

test('validarLoteExport: no-objeto / sin items / items vacío → error', () => {
  assert.equal(validarLoteExport(null).ok, false)
  assert.equal(validarLoteExport('texto').ok, false)
  assert.equal(validarLoteExport({ schema: 'brigada.export/v1' }).ok, false)
  const vacio = validarLoteExport({ schema: 'brigada.export/v1', items: [] })
  assert.equal(vacio.ok, false)
  assert.match(vacio.error, /vac/i)
})

test('validarLoteExport: item sin tag o sin resultados → error indicando la captura', () => {
  const sinTag = validarLoteExport({ ...loteValido, items: [{ resultados: { a: true } }] })
  assert.equal(sinTag.ok, false)
  assert.match(sinTag.error, /#1|tag/i)
  const sinRes = validarLoteExport({ ...loteValido, items: [{ tag: 'E-9' }] })
  assert.equal(sinRes.ok, false)
  assert.match(sinRes.error, /resultados/i)
})

test('construirPayloadImport: mapea campos definidos y anida meta', () => {
  const item = {
    captura_id: 'cap-1',
    creado_en: '2026-01-02T03:04:05.000Z',
    tag: 'E-1',
    resultados: { a: true, b: false },
    observaciones: null,
    gps: { lat: -0.18, lng: -78.46 },
  }
  const p = construirPayloadImport(item, { archivo_hash: 'abc123', dispositivo: 'android-field' })
  assert.equal(p.tag, 'E-1')
  assert.deepEqual(p.resultados, { a: true, b: false })
  assert.equal(p.captura_id, 'cap-1')
  assert.equal(p.creado_en, '2026-01-02T03:04:05.000Z')
  assert.equal(p.observaciones, null)
  assert.deepEqual(p.gps, { lat: -0.18, lng: -78.46 })
  // campos no definidos se omiten por completo (sin foto ni dispositivo de ítem)
  assert.equal('foto_evidencia_base64' in p, false)
  assert.equal('dispositivo' in p, false)
  // meta con hash y dispositivo del lote
  assert.deepEqual(p.meta, { archivo_hash: 'abc123', dispositivo: 'android-field' })
})

test('construirPayloadImport: sin meta no añade la clave meta; tag/resultados siempre', () => {
  const p = construirPayloadImport({ tag: 'E-2', resultados: {} })
  assert.equal(p.tag, 'E-2')
  assert.deepEqual(p.resultados, {})
  assert.equal('meta' in p, false)
  assert.equal('captura_id' in p, false)
  assert.equal('creado_en' in p, false)
})

test('resumirImportacion: contadores por estado', () => {
  const resumen = resumirImportacion([
    { tag: 'E-1', estado: 'creado', http: 201 },
    { tag: 'E-2', estado: 'duplicado', http: 200 },
    { tag: 'E-3', estado: 'error', http: 404, msg: 'tag desconocido' },
    { tag: 'E-4', estado: 'creado', http: 201 },
    { tag: 'E-5', estado: 'error', http: 400 },
  ])
  assert.deepEqual(resumen, { total: 5, creados: 2, duplicados: 1, errores: 2 })
  assert.deepEqual(resumirImportacion([]), { total: 0, creados: 0, duplicados: 0, errores: 0 })
})

test('hashArchivo: hex estable y sensible al contenido', async () => {
  const a = await hashArchivo('hola mundo')
  const b = await hashArchivo('hola mundo')
  const c = await hashArchivo('hola mundo!')
  assert.equal(a, b)
  assert.match(a, /^[0-9a-f]+$/)
  assert.ok(a.length >= 8, `hash demasiado corto: ${a}`)
  assert.notEqual(a, c)
})
