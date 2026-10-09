/**
 * Tests PUROS de la pantalla «Configurar servidor» (A0):
 *  - esUrlServidorValida(): acepta http(s):// con hostname parseable; rechaza el resto.
 * El bundle tests/.build/servidor.mjs se genera en test:build (esbuild) desde
 * src/lib/nativo.ts, con los plugins de Capacitor y ./offline marcados como --external.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const { esUrlServidorValida, esHttpPublicoInseguro } = await import('./.build/servidor.mjs')

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

test('esHttpPublicoInseguro: http:// en LAN local (RFC1918/localhost) ⇒ false', () => {
  assert.equal(esHttpPublicoInseguro('http://192.168.1.10:8080/api/v1'), false)
  assert.equal(esHttpPublicoInseguro('http://10.0.0.5/api/v1'), false)
  assert.equal(esHttpPublicoInseguro('http://172.16.5.4:3200/api/v1'), false)
  assert.equal(esHttpPublicoInseguro('http://172.31.255.1/api/v1'), false)
  assert.equal(esHttpPublicoInseguro('http://localhost:3200/api/v1'), false)
  assert.equal(esHttpPublicoInseguro('http://127.0.0.1:3200/api/v1'), false)
  assert.equal(esHttpPublicoInseguro('http://pc-brigada.local/api/v1'), false)
  assert.equal(esHttpPublicoInseguro('http://169.254.1.9/api/v1'), false)
})

test('esHttpPublicoInseguro: http:// con host público ⇒ true (aviso)', () => {
  assert.equal(esHttpPublicoInseguro('http://brigada.ejemplo.com/api/v1'), true)
  assert.equal(esHttpPublicoInseguro('http://8.8.8.8/api/v1'), true)
  assert.equal(esHttpPublicoInseguro('http://172.32.0.1/api/v1'), true) // fuera de RFC1918
  assert.equal(esHttpPublicoInseguro('http://192.169.1.1/api/v1'), true) // casi-privada
})

test('esHttpPublicoInseguro: https y entradas inválidas ⇒ false (no avisar dos veces)', () => {
  assert.equal(esHttpPublicoInseguro('https://brigada.ejemplo.com/api/v1'), false)
  assert.equal(esHttpPublicoInseguro('no-es-una-url'), false)
  assert.equal(esHttpPublicoInseguro(''), false)
  assert.equal(esHttpPublicoInseguro(null), false)
  assert.equal(esHttpPublicoInseguro(undefined), false)
})
