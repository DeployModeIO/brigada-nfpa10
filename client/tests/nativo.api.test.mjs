/**
 * Tests PUROS del cliente nativo/API (APK Capacitor):
 *  - resolverApiBase(): prioridad env → base guardada → origen web → default local.
 *  - esNativo(): degradación segura fuera de plataforma nativa (Node/web).
 * El bundle tests/.build/api.mjs se genera en test:build (esbuild) con los plugins
 * de Capacitor marcados como --external (no se ejecutan en Node salvo esNativo()).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { resolverApiBase, esNativo, API_BASE } = await import('./.build/api.mjs')

const FALLBACK = 'http://localhost:3200/api/v1'

test('resolverApiBase: envUrl gana a todo', () => {
  assert.equal(
    resolverApiBase({ envUrl: 'http://10.0.0.5:8080/api/v1', isNative: true, stored: 'http://x/api/v1', origin: 'https://localhost' }),
    'http://10.0.0.5:8080/api/v1',
  )
  assert.equal(
    resolverApiBase({ envUrl: 'http://pc:8080/api/v1', isNative: false, origin: 'http://localhost:5199' }),
    'http://pc:8080/api/v1',
  )
})

test('resolverApiBase: base guardada gana sobre el origen y el default', () => {
  assert.equal(
    resolverApiBase({ isNative: true, stored: 'http://192.168.0.20:8080/api/v1', origin: 'https://localhost' }),
    'http://192.168.0.20:8080/api/v1',
  )
  assert.equal(
    resolverApiBase({ isNative: false, stored: 'http://pc:3200/api/v1', origin: 'http://localhost:5199' }),
    'http://pc:3200/api/v1',
  )
})

test('resolverApiBase: en web usa el mismo origen + /api/v1', () => {
  assert.equal(resolverApiBase({ isNative: false, origin: 'http://localhost:5199' }), 'http://localhost:5199/api/v1')
  assert.equal(resolverApiBase({ isNative: false, origin: 'https://brigada.local' }), 'https://brigada.local/api/v1')
})

test('resolverApiBase: en NATIVO nunca usa el origen del WebView (https://localhost)', () => {
  const out = resolverApiBase({ isNative: true, origin: 'https://localhost' })
  assert.equal(out, FALLBACK)
  assert.ok(!out.includes('https://localhost'), 'la base nativa no debe ser el origen capacitor')
})

test('resolverApiBase: default local cuando no hay nada (web sin origen válido o nativo)', () => {
  assert.equal(resolverApiBase({ isNative: false }), FALLBACK)
  assert.equal(resolverApiBase({ isNative: false, origin: 'file://' }), FALLBACK)
  assert.equal(resolverApiBase({ isNative: true }), FALLBACK)
})

test('resolverApiBase: valores vacíos/espacios se ignoran (trim)', () => {
  assert.equal(resolverApiBase({ envUrl: '   ', isNative: false, stored: '  ', origin: 'http://localhost:5199' }), 'http://localhost:5199/api/v1')
  assert.equal(
    resolverApiBase({ isNative: true, stored: '  http://pc:8080/api/v1  ' }),
    'http://pc:8080/api/v1',
  )
})

test('API_BASE inicial es un string no vacío (misma semántica que antes en el arranque)', () => {
  assert.equal(typeof API_BASE, 'string')
  assert.ok(API_BASE.length > 0)
})

test('esNativo(): en Node (sin plataforma nativa) es false, sin lanzar', async () => {
  assert.equal(await esNativo(), false)
})