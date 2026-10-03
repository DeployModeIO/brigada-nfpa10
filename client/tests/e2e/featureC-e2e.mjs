/**
 * E2E FEATURES-C (escáner + inspección) — Playwright 1.62, chromium cacheado.
 * Requiere backend :3200 y dev :5199 corriendo.
 *   PW_MODULE=/tmp/kilo/nfpa-e2e-162/node_modules/playwright/index.mjs node tests/e2e/featureC-e2e.mjs
 * No es *.test.mjs: se ejecuta a mano (no entra en `npm test`).
 */
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createRequire } from 'node:module'

const PW = process.env.PW_MODULE || 'playwright'
const { chromium } = await import(PW)

const BASE = 'http://localhost:5199'
const API = 'http://localhost:3200/api/v1'
const DIR = '/tmp'
const require2 = createRequire(import.meta.url)
const QR = require2('/home/deploymodeio/proyectos/brigada-nfpa10/client/node_modules/qrcode')

// JPEG 8x8 rojo válido (placeholder de evidencia capturada en campo)
const JPEG_RED_B64 =
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAAIAMABAREA/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/9oACAEBAAA/APn6iiigD//2Q='

let pasada = 0
const check = (nombre, cond = true, extra = '') => {
  if (cond) {
    pasada++
    console.log(`  ✔ ${nombre} ${extra}`)
  } else {
    console.error(`  ✘ ${nombre} ${extra}`)
    throw new Error(`Fallo: ${nombre}`)
  }
}

const tmp = mkdtempSync(path.join(tmpdir(), 'nfpa-c-'))
const qrTag = 'EXTF-ALM-002'
const qrPath = path.join(tmp, 'qr-etiqueta.png')
await QR.toFile(qrPath, qrTag, { width: 320, margin: 1 })
const fotoPath = path.join(tmp, 'evidencia.jpg')
writeFileSync(fotoPath, Buffer.from(JPEG_RED_B64, 'base64'))

async function cola(page) {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('brigada-nfpa10', 1)
        req.onupgradeneeded = () => {
          const db = req.result
          if (!db.objectStoreNames.contains('cola_inspecciones')) {
            const s = db.createObjectStore('cola_inspecciones', { keyPath: 'id', autoIncrement: true })
            s.createIndex('by_estado', 'estado')
          }
        }
        req.onsuccess = () => {
          try {
            const db = req.result
            const tx = db.transaction('cola_inspecciones', 'readonly')
            const all = tx.objectStore('cola_inspecciones').getAll()
            all.onsuccess = () =>
              resolve(all.result.map((i) => ({ id: i.id, tag: i.payload && i.payload.tag, estado: i.estado })))
            all.onerror = () => reject(new Error('getAll fallo'))
          } catch (e) {
            reject(e)
          }
        }
        req.onerror = () => reject(new Error('no se pudo abrir IDB'))
      }),
  )
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  acceptDownloads: true,
  geolocation: { latitude: -0.1807, longitude: -78.4678 },
  permissions: ['geolocation'],
})
// El SW del scaffold apunta el endpoint equivocado (informado al board); se neutraliza solo en tests.
await context.addInitScript(() => {
  if (navigator.serviceWorker) {
    navigator.serviceWorker.register = () => Promise.reject(new Error('e2e: service worker neutralizado'))
  }
})

const page = await context.newPage()
const consola = []
page.on('console', (m) => {
  if (m.type() === 'error') consola.push(m.text())
})
page.on('pageerror', (e) => consola.push(`pageerror: ${e.message}`))

try {
  /* ---------- 1) login inspector (valida fix de AuthContext) ---------- */
  console.log('1) Login inspector via UI')
  await page.goto(`${BASE}/`)
  await page.fill('#usuario', 'inspector')
  await page.fill('#clave', '1nsp3ct0r')
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 15000 })
  check('login UI → sesión iniciada, fuera de /login', !page.url().includes('/login'), page.url())

  /* ---------- 2) /buscar?q=EXT ---------- */
  console.log('2) /buscar?q=EXT')
  await page.goto(`${BASE}/buscar?q=EXT`)
  await page.getByTestId('buscar-extintores').waitFor()
  await page.getByTestId('fila-EXTF-ALM-002').waitFor({ timeout: 10000 })
  check('búsqueda server-side devuelve filas EXTF')
  await page.getByTestId('fila-EXTF-ALM-002').getByRole('link').click()

  /* ---------- 3) formulario: validación + checklist con 1 falla ---------- */
  console.log('3) Formulario /inspeccion/:tag')
  await page.waitForURL('**/inspeccion/EXTF-ALM-002', { timeout: 10000 })
  await page.getByTestId('ficha-tag').waitFor()
  const badge = await page.getByTestId('estado-badge').innerText()
  check('header con tag + semáforo', /Vigente|Por vencer|Vencido|Rechazado|inspeccion/i.test(badge), `(${badge.trim()})`)

  await page.getByTestId('guardar-inspeccion').click()
  await page.getByText(/Faltan \d+ respuesta\(s\)/).waitFor()
  check('validación inline: exige responder todos los ítems')
  const boxGuardar = await page.getByTestId('guardar-inspeccion').boundingBox()
  const boxPasa = await page.getByTestId('pasa-presion_rango').boundingBox()
  check('touch targets ≥56px (guardar y toggle)', boxGuardar.height >= 56 && boxPasa.height >= 56, `g=${Math.round(boxGuardar.height)} p=${Math.round(boxPasa.height)}`)

  for (const clave of ['presion_rango', 'visible_sin_obstaculos', 'senaletica_altura', 'pasador_precinto', 'manometro_rango', 'precinto_intacto', 'manguera_sin_fisuras', 'cilindro_sin_corrosion', 'tarjeta_legible', 'acceso_despejado', 'soporte_firme']) {
    await page.getByTestId(`pasa-${clave}`).click()
  }
  await page.getByTestId('falla-senaletica_visible').click()
  const pressed = await page.getByTestId('falla-senaletica_visible').getAttribute('aria-pressed')
  check('interruptor Pasa/Falla responde con aria-pressed', pressed === 'true')
  await page.getByTestId('bloque-no-conformidad').waitFor()
  check('bloque de no conformidad aparece al fallar un ítem')
  await page.screenshot({ path: `${DIR}/nfpa-C-form-falla-foto.png`, fullPage: true })

  /* ---------- 4) foto + GPS + guardar online (POST 201) ---------- */
  console.log('4) Foto comprimida + GPS + POST /inspections')
  await page.getByTestId('foto-input').setInputFiles(fotoPath)
  await page.getByTestId('foto-preview').waitFor({ timeout: 15000 })
  check('foto capturada → preview (comprimida a JPEG≤1024px)')
  await page.getByTestId('observaciones').fill('SEÑALÉTICA CAÍDA EN PUERTA DE BODEGA')
  await page.getByTestId('gps-btn').click()
  await page.getByTestId('gps-lectura').waitFor({ timeout: 12000 })
  const gpsTxt = await page.getByTestId('gps-lectura').innerText()
  check('GPS: lat/lng obtenidos', gpsTxt.includes('-0.1807') && gpsTxt.includes('-78.4678'))

  const respPost = page
    .waitForResponse((r) => r.url().includes('/api/v1/inspections') && r.request().method() === 'POST', { timeout: 20000 })
    .catch(() => null)
  await page.getByTestId('guardar-inspeccion').click()
  const post = await respPost
  const json201 = post && post.status() === 201 ? await post.json().catch(() => null) : null
  check('POST /inspections responde 201 con resumen', Boolean(json201) && json201.fallas.includes('senaletica_visible'))

  const toast = page.getByTestId('toast')
  await toast.getByText(/Pr\u00F3ximo vencimiento|Próximo vencimiento/).waitFor({ timeout: 8000 })
  check('toast de resultado muestra el nuevo vencimiento', true)

  await page.getByTestId('historial').waitFor({ timeout: 12000 })
  const histTxt = await page.getByTestId('historial').innerText()
  check('historial del tag muestra la inspección con badge Falla', histTxt.toUpperCase().includes('FALLA (1)'), JSON.stringify(histTxt.slice(0, 160)))
  await page.screenshot({ path: `${DIR}/nfpa-C-historial.png`, fullPage: true })

  /* ---------- 5) escáner: fallback de permisos + QR por imagen ---------- */
  console.log('5) /escanear — fallbacks')
  await page.goto(`${BASE}/escanear`)
  await page.getByTestId('subir-qr-input').waitFor()
  await page.waitForTimeout(1200) // deja aparecer el estado de cámara (denegado en headless)
  const fallbackVisible =
    (await page.getByTestId('aviso-permiso').isVisible().catch(() => false)) ||
    (await page.getByText(/cámara no disponible|No se detectó|no expone/i).first().isVisible().catch(() => false))
  check('permiso denegado / sin cámara → instrucciones de fallback visibles', fallbackVisible)
  await page.screenshot({ path: `${DIR}/nfpa-C-escaner-permiso.png`, fullPage: true })

  await page.getByTestId('busqueda-rapida').fill('EXTF-ALM')
  await page.getByRole('button', { name: /Buscar/ }).click()
  await page.getByTestId('res-EXTF-ALM-002').waitFor({ timeout: 10000 })
  check('búsqueda rápida (GET /extinguishers?q=) muestra coincidencias')

  await page.getByTestId('subir-qr-input').setInputFiles(qrPath)
  await page.waitForURL('**/inspeccion/EXTF-ALM-002', { timeout: 15000 })
  check('QR de imagen decodificado con jsQR → navega a /inspeccion/:tag')

  /* ---------- 6) generador QR (bonus) ---------- */
  console.log('6) Generador QR')
  await page.goto(`${BASE}/escanear`)
  await page.click('#tab-generador')
  await page.getByTestId('qr-tag-input').fill('ETQ-PRUEBA-C')
  await page.getByRole('button', { name: /Generar QR/ }).click()
  await page.getByTestId('qr-preview').waitFor({ timeout: 10000 })
  const src = await page.getByTestId('qr-preview').getAttribute('src')
  check('qrcode.toDataURL genera preview PNG (512px)', Boolean(src) && src.startsWith('data:image/png'))
  const dl = page.waitForEvent('download', { timeout: 10000 })
  await page.getByRole('button', { name: /Descargar PNG/ }).click()
  const download = await dl
  check('descarga PNG con nombre etiqueta-ETQ-PRUEBA-C.png', download.suggestedFilename() === 'etiqueta-ETQ-PRUEBA-C.png')
  await page.screenshot({ path: `${DIR}/nfpa-C-generador.png`, fullPage: true })

  /* ---------- 7) offline: guardar en cola IndexedDB ---------- */
  console.log('7) Ruta offline → enqueue + sync')
  await page.goBack().catch(() => undefined)
  if (!page.url().includes('/escanear')) await page.goto(`${BASE}/escanear`)
  // navegación SPA (sin recarga) hacia un formulario ya cargable
  await page.click('#tab-escaner')
  await page.goto(`${BASE}/buscar?q=EXTF-ALM-012`)
  await page.getByTestId('fila-EXTF-ALM-012').getByRole('link').click()
  await page.getByTestId('ficha-tag').waitFor({ timeout: 10000 })

  await context.setOffline(true)
  for (const clave of ['presion_rango', 'visible_sin_obstaculos', 'senaletica_altura', 'pasador_precinto', 'manometro_rango', 'precinto_intacto', 'manguera_sin_fisuras', 'cilindro_sin_corrosion', 'tarjeta_legible', 'senaletica_visible', 'acceso_despejado', 'soporte_firme']) {
    await page.getByTestId(`pasa-${clave}`).click()
  }
  await page.getByTestId('falla-soporte_firme').click()
  await page.getByTestId('observaciones').fill('SOPLOTE DEFECTUOSO (GUARDED OFFLINE)')
  await page.getByTestId('guardar-inspeccion').click()
  await page.getByTestId('banner-cola').waitFor({ timeout: 8000 })
  check('offline: guardado local → banner "se sincronizará"', true)
  await page.screenshot({ path: `${DIR}/nfpa-C-offline-guardado.png`, fullPage: true })
  const fila = await cola(page)
  check('fila en IndexedDB cola_inspecciones con payload del tag', fila.length === 1 && fila[0].tag === 'EXTF-ALM-012', JSON.stringify(fila))

  /* ---------- 8) recuperar conexión → drain automático ---------- */
  console.log('8) setOffline(false) → drainQueue (listener global de main.tsx)')
  await context.setOffline(false)
  let colaAhora = []
  const inicio = Date.now()
  while (Date.now() - inicio < 25000) {
    colaAhora = await cola(page)
    if (colaAhora.length === 0) break
    await page.waitForTimeout(1500)
  }
  check('cola sincronizada queda vacía al volver online', colaAhora.length === 0, JSON.stringify(colaAhora))

  const token = await page.evaluate(() => localStorage.getItem('nfpa_token'))
  const serverRows = await page.evaluate(
    async ({ api, token, tag }) => {
      const r = await fetch(`${api}/inspections?tag=${tag}&size=5`, { headers: { Authorization: `Bearer ${token}` } })
      const j = await r.json()
      return j.items.map((i) => ({ id: i.id, observaciones: i.observaciones, fallas: i.fallas }))
    },
    { api: API, token, tag: 'EXTF-ALM-012' },
  )
  const sincronizada = serverRows.find((i) => i.observaciones && i.observaciones.includes('GUARDED OFFLINE'))
  check('la inspección offline llegó al backend (POST /inspections del drain)', Boolean(sincronizada))

  await page.reload({ waitUntil: 'networkidle' }).catch(() => undefined)
  await page.getByTestId('historial').waitFor({ timeout: 12000 })
  const hist2 = await page.getByTestId('historial').innerText()
  check('historial visible tras sync (badge Falla)', hist2.toUpperCase().includes('FALLA (1)'))
  await page.screenshot({ path: `${DIR}/nfpa-C-sincronizado.png`, fullPage: true })

  /* ---------- 9) errores de consola ---------- */
  const ruido = /favicon|WebSocket|networkidle|Failed to fetch|net::ERR|Service Worker|service worker|Load failure|chrome-error|404|503|net::ERR_INTERNET_DISCONNECTED/i
  const inesperados = consola.filter((m) => !ruido.test(m))
  check('sin errores de consola inesperados', inesperados.length === 0, JSON.stringify(inesperados.slice(0, 4)))

  console.log(`\nRESULTADO FEATURES-C: ${pasada} verificaciones OK`)
} finally {
  await browser.close()
}
