import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))

function lum(hex) {
  const n = hex.replace('#', '')
  const c = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]
}
const ratio = (a, b) => {
  const [l1, l2] = [lum(a), lum(b)].sort((x, y) => y - x)
  return +((l1 + 0.05) / (l2 + 0.05)).toFixed(2)
}

function bloque(css, selector) {
  const ini = css.indexOf(selector)
  assert.ok(ini >= 0, `falta bloque ${selector}`)
  const fin = css.indexOf('}', ini)
  return css.slice(ini, fin)
}
function token(bloqueCss, nombre) {
  const m = bloqueCss.match(new RegExp(`${nombre}:\\s*(#[0-9a-fA-F]{6})`))
  assert.ok(m, `falta ${nombre}`)
  return m[1]
}

test('tokens light y read oscurecidos como la línea (sin sky-500/emerald-500)', () => {
  const css = readFileSync(`${raiz}src/styles/tokens.css`, 'utf8')
  for (const sel of ["[data-theme='light']", "[data-theme='read']"]) {
    const b = bloque(css, sel)
    assert.equal(token(b, '--primary'), '#0369a1', `${sel} --primary`)
    assert.equal(token(b, '--ok'), '#047857', `${sel} --ok`)
    assert.equal(token(b, '--warn'), '#92400e', `${sel} --warn`)
    assert.equal(token(b, '--err'), '#b91c1c', `${sel} --err`)
    assert.equal(token(b, '--info'), '#0369a1', `${sel} --info`)
  }
})

test('contraste WCAG ≥4.5 de tokens de color sobre surface y bg en light/read', () => {
  const css = readFileSync(`${raiz}src/styles/tokens.css`, 'utf8')
  for (const sel of ["[data-theme='light']", "[data-theme='read']"]) {
    const b = bloque(css, sel)
    const fondos = [token(b, '--surface'), token(b, '--bg')]
    for (const t of ['--primary', '--ok', '--warn', '--err', '--info', '--text', '--text2']) {
      const r = Math.min(...fondos.map((f) => ratio(token(b, t), f)))
      assert.ok(r >= 4.5, `${sel} ${t} vs surface/bg = ${r} < 4.5`)
    }
    assert.ok(ratio(token(b, '--on-primary'), token(b, '--primary')) >= 4.5, `${sel} on-primary vs primary`)
  }
})

test('seed de brand del demo y defaults de admin usan la paleta oscurecida', () => {
  const demo = readFileSync(`${raiz}src/lib/demoMock.ts`, 'utf8')
  const linea = /brand:\s*\{ primary: '#0369a1', ok: '#047857', warn: '#92400e', err: '#b91c1c', info: '#0369a1' \}/
  assert.ok(linea.test(demo), 'demoMock brand seed debe ser la paleta oscurecida de la línea')
  assert.ok(!demo.includes('#0ea5e9'), 'el demo no debe sembrar sky-500')
  const marca = readFileSync(`${raiz}src/features/admin/MarcaSection.tsx`, 'utf8')
  assert.ok(marca.includes("primary: '#0369a1'"), 'MarcaSection defaults coherentes')
})

test('CTA primarios: login submit (16px) ≥4.5 con los tokens', () => {
  const css = readFileSync(`${raiz}src/styles/tokens.css`, 'utf8')
  for (const sel of ["[data-theme='light']", "[data-theme='read']"]) {
    const b = bloque(css, sel)
    const r = ratio(token(b, '--on-primary'), token(b, '--primary'))
    assert.ok(r >= 4.5, `${sel} CTA login bg-primary/text-on-primary = ${r} < 4.5`)
  }
})

test('CTA DESCARGAR (exportar) y CONFIRMAR (importar) 18px bold: ≥4.5 en light/read, ≥3.0 en dark', () => {
  const css = readFileSync(`${raiz}src/styles/tokens.css`, 'utf8')
  for (const sel of ["[data-theme='light']", "[data-theme='read']"]) {
    const b = bloque(css, sel)
    const r = ratio(token(b, '--on-primary'), token(b, '--primary'))
    assert.ok(r >= 4.5, `${sel} CTA bg-primary/text-on-primary = ${r} < 4.5`)
  }
  const d = bloque(css, "[data-theme='dark']")
  const rd = ratio(token(d, '--on-primary'), token(d, '--primary'))
  assert.ok(rd >= 3.0, `dark CTA bg-primary/text-on-primary = ${rd} < 3.0 (texto grande)`)
})

test('default brand del servidor (settings.js) sin sky-500 y ≥4.5 con blanco', () => {
  const src = readFileSync(`${raiz}../server/src/routes/settings.js`, 'utf8')
  assert.ok(!src.includes('#0ea5e9'), 'settings.js no debe sembrar sky-500 por defecto')
  const m = src.match(/brand:\s*\{ primary: '(#[0-9a-fA-F]{6})'/)
  assert.ok(m, 'falta brand.primary en DEFAULTS de settings.js')
  const r = ratio('#ffffff', m[1])
  assert.ok(r >= 4.5, `brand.primary default vs blanco = ${r} < 4.5`)
})

test('series del gráfico (tokens ok/warn/err/text) ≥3.0 sobre surface', () => {
  const css = readFileSync(`${raiz}src/styles/tokens.css`, 'utf8')
  for (const sel of ["[data-theme='light']", "[data-theme='read']"]) {
    const b = bloque(css, sel)
    for (const t of ['--ok', '--warn', '--err', '--text']) {
      const r = ratio(token(b, t), token(b, '--surface'))
      assert.ok(r >= 3.0, `${sel} serie ${t} = ${r} < 3.0`)
    }
  }
})
