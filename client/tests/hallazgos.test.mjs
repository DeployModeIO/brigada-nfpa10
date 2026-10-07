import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const leer = (p) => readFileSync(`${raiz}${p}`, 'utf8')

test('catálogo de hallazgos presente en server settings (LIST_KEYS + DEFAULTS)', () => {
  const src = leer('..\\server\\src\\routes\\settings.js')
  assert.ok(src.includes("'configHallazgos'"), 'configHallazgos debe estar en LIST_KEYS')
  assert.match(src, /configHallazgos:\s*\[/)
  // Se espera un catálogo sustancial basado en estándares (≥18 hallazgos)
  const bloque = src.slice(src.indexOf('configHallazgos: ['), src.indexOf(']', src.indexOf('configHallazgos: [')))
  const items = (bloque.match(/'/g) || []).length / 2
  assert.ok(items >= 18, `catálogo muy corto: ${items} hallazgos`)
})

test('catálogo cubre los hallazgos solicitados y estándares', () => {
  const src = leer('..\\server\\src\\routes\\settings.js')
  for (const clave of ['Sello o precinto', 'presión baja', 'hidrostática', 'corrosión', 'Manómetro', 'SCBA', 'obstruido']) {
    assert.ok(src.includes(clave), `falta hallazgo clave: ${clave}`)
  }
})

test('listasConfig expone HALLAZGOS_INICIALES con espejo localStorage', () => {
  const src = leer('src/features/admin/listasConfig.ts')
  assert.ok(src.includes('KEY_HALLAZGOS'), 'falta KEY_HALLAZGOS')
  assert.ok(src.includes('HALLAZGOS_INICIALES'), 'falta HALLAZGOS_INICIALES')
  assert.ok(src.includes('leerHallazgos') && src.includes('escribirHallazgos'), 'faltan leer/escribir hallazgos')
})

test('ListasSection edita hallazgos (tercera lista) e InspectionFormPage los consume', () => {
  assert.ok(leer('src/features/admin/ListasSection.tsx').includes('Hallazgos de terreno'), 'falta editor en ListasSection')
  const form = leer('src/features/inspection/InspectionFormPage.tsx')
  assert.ok(form.includes('data-testid="hallazgo-select"'), 'falta el dropdown de hallazgos')
  assert.ok(form.includes('HALLAZGOS_INICIALES'), 'falta import del catálogo en el formulario')
})

test('demoMock refleja el catálogo (modo demo sin server)', () => {
  assert.ok(leer('src/lib/demoMock.ts').includes('configHallazgos'), 'falta configHallazgos en demoMock')
})
