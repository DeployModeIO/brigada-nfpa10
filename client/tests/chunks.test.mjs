/**
 * Tests del INVARIANTE de chunks (incidente pantalla blanca 09/10/2026): un paquete CJS y
 * TODO su árbol de dependencias runtime deben caer en el MISMO chunk. Si se parte el grafo
 * require() entre chunks, la inicialización CJS inter-chunk rompe el boot
 * («Cannot set properties of undefined (setting 'exports')») y React nunca monta.
 * El bundle tests/.build/chunks.mjs se genera en test:build desde vite.config.ts
 * (defineConfig devuelve el objeto tal cual: solo se ejercita manualChunks).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const cfg = (await import('./.build/chunks.mjs')).default
const mc = cfg.build.rollupOptions.output.manualChunks

test('manualChunks: árbol CJS completo de qrcode en UN chunk (dep-qrcode)', () => {
  assert.equal(mc('/x/client/node_modules/qrcode/lib/browser.js'), 'dep-qrcode')
  assert.equal(mc('/x/client/node_modules/qrcode/lib/core/qrcode.js'), 'dep-qrcode')
  assert.equal(mc('/x/client/node_modules/dijkstrajs/index.js'), 'dep-qrcode')
  assert.equal(mc('/x/client/node_modules/encode-utf8/index.js'), 'dep-qrcode')
  assert.equal(mc('/x/client/node_modules/pngjs/lib/png.js'), 'dep-qrcode')
})

test('manualChunks: pdfmake y xlsx NO se parten (colapsados al vendor con su árbol CJS)', () => {
  assert.equal(mc('/x/client/node_modules/pdfmake/build/pdfmake.js'), 'vendor')
  assert.equal(mc('/x/client/node_modules/pdfmake/build/vfs_fonts.js'), 'vendor')
  assert.equal(mc('/x/client/node_modules/@foliojs-fork/pdfkit/js/pdfkit.js'), 'vendor')
  assert.equal(mc('/x/client/node_modules/iconv-lite/lib/index.js'), 'vendor')
  assert.equal(mc('/x/client/node_modules/xlsx/xlsx.mjs'), 'vendor')
  assert.equal(mc('/x/client/node_modules/cfb/cfb.js'), 'vendor')
  assert.equal(mc('/x/client/node_modules/codepage/cptable.js'), 'vendor')
})

test('manualChunks: chunks autocontenidos se mantienen (jsqr, idb, @tanstack)', () => {
  assert.equal(mc('/x/client/node_modules/jsqr/dist/jsQR.js'), 'dep-jsqr')
  assert.equal(mc('/x/client/node_modules/idb/build/index.js'), 'dep-idb')
  assert.equal(mc('/x/client/node_modules/@tanstack/react-virtual/dist/esm/index.js'), 'dep-virtual')
  assert.equal(mc('/x/client/node_modules/@tanstack/virtual-core/dist/esm/index.js'), 'dep-virtual')
})

test('manualChunks: el matcher es preciso (nada con «qrcode» en el nombre cae por substring)', () => {
  // El matcher ancla en segmentos de ruta node_modules/<paquete>/, no en substrings sueltos.
  assert.equal(mc('/x/client/node_modules/react-qrcode-holiday/index.js'), 'vendor')
  assert.equal(mc('/x/client/src/lib/api.ts'), undefined)
  assert.equal(mc('/x/client/src/features/planta/pins.ts'), undefined)
})
