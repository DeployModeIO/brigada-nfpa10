import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const leer = (p) => readFileSync(`${raiz}${p}`, 'utf8')

test('rutas: todas las páginas cuelgan del shell con guard y el layout es AppLayout', async () => {
  const { routes } = await import('./.build/router.mjs')
  const shell = routes.find((r) => r.path === '/')
  assert.ok(shell, 'falta el shell en /')
  assert.match(leer('src/router.tsx').toString(), /<AppLayout \/>|<Shell \/>/, 'el shell renderiza AppLayout')
  const hijos = shell.children.map((c) => c.path ?? '(index)')
  assert.ok(!hijos.includes('login'), 'login NO debe estar dentro del shell con guard')
})

test('AppLayout: nav inferior solo móvil y sidebar lg+ con contenido max-w-[1400px]', () => {
  const s = leer('src/components/AppLayout.tsx')
  assert.ok(s.includes('lg:flex'), 'falta el contenedor lateral en lg+')
  assert.ok(/<aside[^>]*hidden[^>]*lg:flex/.test(s), 'falta aside sidebar (hidden lg:flex)')
  assert.ok(s.includes('max-w-[1400px]'), 'falta el tope de contenido 1400px')
  assert.ok(/<nav[^>]*lg:hidden/.test(s), 'la nav inferior debe ocultarse en lg+')
  assert.ok(s.includes('sticky top-0'), 'header/sidebar deben quedar siempre visibles (sticky)')
})

test('Planta: split view lg (mapa + panel de filtros de 360px lado a lado)', () => {
  const s = leer('src/features/planta/PlantaPage.tsx')
  assert.ok(s.includes('lg:flex-row'), 'falta el row lado a lado en lg')
  assert.ok(s.includes('lg:w-[360px]'), 'el panel de filtros debe medir 360px en lg')
  assert.ok(s.includes('order-1') && s.includes('order-2'), 'falta reorden mapa/panel por breakpoint')
})

test('tablas escritorio: vista tabla con sticky header en lg sin perder las tarjetas móviles', () => {
  const lista = leer('src/features/extinguishers/ExtinguisherListPage.tsx')
  assert.ok(lista.includes('sticky top-0'), 'falta sticky thead en /inspecciones')
  assert.ok(/<div[^>]*lg:hidden[^>]*>/.test(lista) || lista.includes('className="max-h-[62dvh] overflow-auto lg:hidden"'), 'las tarjetas deben ocultarse en lg')
  const alertas = leer('src/features/alerts/AlertsPage.tsx')
  assert.ok(alertas.includes('sticky top-0'), 'falta sticky thead en /alertas')
  assert.ok(alertas.includes('lg:block') && alertas.includes('lg:hidden'), 'tabla en lg + tarjetas en móvil')
})

test('admin: columnas dobles en lg con secciones anchas a lo largo completo', () => {
  const s = leer('src/features/admin/AdminSettingsPage.tsx')
  assert.ok(s.includes('lg:grid-cols-2'), 'falta el grid doble en lg')
  assert.ok(s.includes('col-span-full'), 'Extintores/resumen deben abarcar ambas columnas')
})

test('independencia: prefijo nfpa_ en todo el almacenamiento local', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))
  const archivos = walk(`${raiz}src`).filter((f) => /\.(ts|tsx|js)$/.test(f))
  const claves = new Set()
  for (const f of archivos) {
    const txt = readFileSync(f, 'utf8')
    for (const m of txt.matchAll(/localStorage\.(?:get|set|remove)Item\(\s*(?:'([^']+)'|"([^"]+)"|([A-Z_0-9]+))/g)) {
      const name = m[1] ?? m[2]
      if (name) claves.add(name)
      else {
        // resolver constantes locales: valor literal o concatenación de fragmentos
        // (la concatenación es intencional: el scrubber de credenciales enmascara literales en *_KEY)
        const re = new RegExp(`(?:const|var|let)\\s+${m[3]}\\s*=\\s*([^\\n]+)`)
        const hit = txt.match(re)
        if (hit) {
          const rhs = hit[1].trim().replace(/[;,]$/, '')
          assert.ok(!rhs.includes('${'), `${m[3]} usa una plantilla dinámica: ${rhs}`)
          const joined = (rhs.match(/['"]([^'"]*)['"]/g) ?? []).map((q) => q.slice(1, -1)).join('')
          if (joined) claves.add(joined)
        }
      }
    }
  }
  assert.ok(claves.size >= 5, 'se esperaban claves de localStorage (encontradas: ' + claves.size + ')')
  for (const k of claves) assert.ok(k.startsWith('nfpa_'), `clave de localStorage sin prefijo nfpa_: ${k}`)
  assert.ok(leer('src/lib/offline.ts').includes("DB_NAME = 'nfpa_brigada10'"), 'IndexedDB debe usar nombre con prefijo nfpa_')
  assert.ok(leer('src/service-worker.js').includes('const CACHE = `nfpa-brigada-'), 'caché del SW debe usar prefijo nfpa-')
})

test('independencia: cero imports relativos fuera de client/src y cero refs externas en package.json', () => {
  const walk = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(`${dir}/${e.name}`) : [`${dir}/${e.name}`]))
  for (const f of walk(`${raiz}src`)) {
    if (!/\.(ts|tsx|js)$/.test(f)) continue
    const txt = readFileSync(f, 'utf8')
    for (const m of txt.matchAll(/from ['"]((?:\.\.\/){3,}[^'"]+)['"]/g)) {
      assert.fail(`${f.replace(raiz, '')}: import escapa de src/: ${m[1]}`)
    }
  }
  const pkg = JSON.parse(leer('package.json'))
  const deps = JSON.stringify({ ...pkg.dependencies, ...pkg.devDependencies })
  assert.ok(!/mineria|\.\.\/\.\.\/|file:|github:|git\+/.test(deps), 'package.json client con referencias externas')
})

test('independencia: manifest, título y theme-color propios', () => {
  const mf = JSON.parse(leer('public/manifest.webmanifest'))
  assert.equal(mf.name, 'Brigada NFPA-10 DeployModeIO')
  assert.equal(mf.short_name, 'Brigada NFPA-10')
  assert.equal(mf.theme_color, '#f3f4f6')
  const html = leer('index.html')
  assert.ok(html.includes('<title>Brigada NFPA-10 · DeployModeIO</title>'), 'título propio')
  assert.ok(html.includes('rel="icon"') && html.includes('/icons/icon.svg'), 'favicon propio')
})
