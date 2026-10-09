/**
 * Tests PUROS de la pantalla «Configurar servidor» (A0):
 *  - esUrlServidorValida(): acepta http(s):// con hostname parseable; rechaza el resto.
 * El bundle tests/.build/servidor.mjs se genera en test:build (esbuild) desde
 * src/lib/nativo.ts, con los plugins de Capacitor y ./offline marcados como --external.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { esUrlServidorValida } = await import('./.build/servidor.mjs')

test('esUrlServidorValida: acepta http/https con host y puerto', () => {
  assert.equal(esUrlServidorValida('http://192.168.1.10:8080/api/v1'), true)
  assert.equal(esUrlServidorValida('https://brigada.local/api/v1'), true)
  assert.equal(esUrlServidorValida('  http://pc:3200/api/v1  '), true)
  assert.equal(esUrlServidorValida('http://localhost:8080'), true)
})

test('esUrlServidorValida: rechaza esquemas no http(s) y entradas inválidas', () => {
  assert.equal(esUrlServidorValida('ftp://pc/api/v1'), false)
  assert.equal(esUrlServidorValida('capacitor://localhost'), false)
  assert.equal(esUrlServidorValida('192.168.1.10:8080'), false)
  assert.equal(esUrlServidorValida('http://'), false)
  assert.equal(esUrlServidorValida(''), false)
  assert.equal(esUrlServidorValida('   '), false)
})

test('esUrlServidorValida: tolera null/undefined/valores no string', () => {
  assert.equal(esUrlServidorValida(null), false)
  assert.equal(esUrlServidorValida(undefined), false)
  // @ts-expect-error valor no string en runtime
  assert.equal(esUrlServidorValida(123), false)
})
