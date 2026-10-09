/**
 * Tests PUROS de la vigencia de la sesión de captura-local (M4):
 *  - sesionCapturaVigente(): null ⇒ sin inicio ⇒ vigente; vence cuando
 *    ahoraMs - Date.parse(desdeIso) > dias*86400000; fecha ilegible nunca expulsa.
 *  - diasSesionCaptura(): parse de VITE_SESION_DIAS con default 30.
 * El bundle tests/.build/modo.mjs se genera en test:build (esbuild) desde src/lib/modo.ts.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { sesionCapturaVigente, anclaSesionLegible, diasSesionCaptura, SESION_CAPTURA_DIAS } = await import(
  './.build/modo.mjs'
)

const AHORA = Date.parse('2026-10-09T12:00:00.000Z')
const AHORA_ISO = '2026-10-09T12:00:00.000Z'

test('sesionCapturaVigente: null ⇒ sesión sin inicio ⇒ vigente', () => {
  assert.equal(sesionCapturaVigente(null, 30, AHORA), true)
})

test('sesionCapturaVigente: dentro del plazo y justo en el límite (30d exactos) ⇒ vigente', () => {
  assert.equal(sesionCapturaVigente('2026-10-09T00:00:00.000Z', 30, AHORA), true)
  assert.equal(sesionCapturaVigente('2026-10-08T12:00:00.000Z', 30, AHORA), true)
  // el vencimiento es ESTRICTO (> días*86400000): exactamente 30 días sigue vigente
  assert.equal(sesionCapturaVigente('2026-09-09T12:00:00.000Z', 30, AHORA), true)
})

test('sesionCapturaVigente: pasada la vigencia ⇒ vencida', () => {
  assert.equal(sesionCapturaVigente('2026-09-09T11:59:59.999Z', 30, AHORA), false)
  assert.equal(sesionCapturaVigente('2026-01-01T00:00:00.000Z', 30, AHORA), false)
})

test('sesionCapturaVigente: el plazo en días escala (7 días)', () => {
  // 7d-1h atrás ⇒ vigente; 7d+1h atrás ⇒ vencida (respecto a AHORA = 9-oct 12:00Z).
  assert.equal(sesionCapturaVigente('2026-10-02T13:00:00.000Z', 7, AHORA), true)
  assert.equal(sesionCapturaVigente('2026-10-02T11:00:00.000Z', 7, AHORA), false)
})

test('sesionCapturaVigente: fecha ilegible ⇒ ancla «ahora» (vigente; el llamador re-ancla)', () => {
  assert.equal(sesionCapturaVigente('no-es-fecha', 30, AHORA), true)
  assert.equal(sesionCapturaVigente('', 30, AHORA), true)
})

test('anclaSesionLegible: solo un string parseable como fecha es ancla legible', () => {
  assert.equal(anclaSesionLegible(AHORA_ISO), true)
  assert.equal(anclaSesionLegible('2026-10-09T12:00:00.000Z'), true)
  assert.equal(anclaSesionLegible('no-es-fecha'), false, 'ilegible ⇒ re-anclar con la hora actual')
  assert.equal(anclaSesionLegible(''), false)
  assert.equal(anclaSesionLegible(null), false, 'null ⇒ sin ancla ⇒ re-anclar')
  assert.equal(anclaSesionLegible(undefined), false)
})

test('diasSesionCaptura: entero >0 gana; el resto cae al default 30', () => {
  assert.equal(diasSesionCaptura('45'), 45)
  assert.equal(diasSesionCaptura('7'), 7)
  assert.equal(diasSesionCaptura(''), 30)
  assert.equal(diasSesionCaptura('0'), 30)
  assert.equal(diasSesionCaptura('-3'), 30)
  assert.equal(diasSesionCaptura('abc'), 30)
  assert.equal(diasSesionCaptura(undefined), 30)
  assert.equal(diasSesionCaptura(undefined, 90), 90, 'default parametrizable')
})

test('SESION_CAPTURA_DIAS: sin env de build usa el default 30', () => {
  assert.equal(SESION_CAPTURA_DIAS, 30)
})
