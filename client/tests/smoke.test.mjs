import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))

test('tokens.css presente con todos los tokens semánticos y 3 temas', () => {
  const p = `${raiz}src/styles/tokens.css`
  assert.ok(existsSync(p), 'falta src/styles/tokens.css')
  const css = readFileSync(p, 'utf8')
  for (const t of ['--bg', '--bg2', '--surface', '--text', '--text2', '--primary', '--ok', '--warn', '--err', '--info', '--ring']) {
    assert.ok(css.includes(`${t}:`), `falta el token ${t}`)
  }
  assert.ok(css.includes('[data-theme=\'dark\']'), 'falta tema dark')
  assert.ok(css.includes('[data-theme=\'light\']'), 'falta tema light')
  assert.ok(css.includes('[data-theme=\'read\']'), 'falta tema read')
  assert.ok(css.includes('#10b981'), '--ok debe ser #10b981')
  assert.ok(css.includes('#ef4444'), '--err debe incluir #ef4444')
  assert.ok(css.includes('#fbf8f1'), 'read bg #fbf8f1')
  assert.ok(css.includes('Georgia'), 'read serif Georgia')
  assert.ok(css.includes('1.7'), 'read line-height 1.7')
})

test('rutas registradas bajo el layout con guard (incluye deep-links)', async () => {
  const { routes } = await import('./.build/router.mjs')
  assert.ok(Array.isArray(routes), 'router debe exportar array routes')
  const login = routes.find((r) => r.path === '/login')
  assert.ok(login, 'falta /login fuera del layout')
  const shell = routes.find((r) => r.path === '/')
  assert.ok(shell?.children, 'falta layout en /')
  const paths = shell.children.map((c) => c.path ?? '(index)')
  for (const esperado of ['(index)', 'escanear', 'inspecciones', 'buscar', 'inspeccion/:tag', 'alertas', 'export', 'admin', '*']) {
    assert.ok(paths.includes(esperado), `falta ruta hija ${esperado}`)
  }
})

test('ThemeContext: ciclo dark → light → read → dark', async () => {
  const { proximoTema, TEMAS } = await import('./.build/theme.mjs')
  assert.deepEqual(TEMAS, ['dark', 'light', 'read'])
  assert.equal(proximoTema('dark'), 'light')
  assert.equal(proximoTema('light'), 'read')
  assert.equal(proximoTema('read'), 'dark')
})

test('manifest y service worker válidos; viewport sin user-scalable=no', () => {
  const mf = JSON.parse(readFileSync(`${raiz}public/manifest.webmanifest`, 'utf8'))
  assert.equal(mf.name, 'Brigada NFPA-10')
  assert.equal(mf.theme_color, '#111827')
  assert.ok(mf.icons.some((i) => i.sizes === '192x192') && mf.icons.some((i) => i.sizes === '512x512'))
  assert.ok(existsSync(`${raiz}src/service-worker.js`), 'falta src/service-worker.js')
  const html = readFileSync(`${raiz}index.html`, 'utf8')
  assert.ok(!/user-scalable\s*=\s*no/.test(html), 'viewport no debe bloquear zoom')
  assert.ok(html.includes('name="theme-color"'), 'falta meta theme-color')
})
