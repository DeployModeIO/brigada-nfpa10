/* Service worker manual — Brigada NFPA-10 (sin workbox).
 * Estrategia: assets same-origin cache-first; navegación network-first con shell offline;
 * API network-first con respuesta 503 offline; cola de inspecciones vía 'sync' + evento online.
 * Comparte esquema IDB con src/lib/offline.ts (usa indexedDB nativo).
 */
/* VERSION la inyecta el plugin brigada-service-worker de vite reemplazando __BUILD_ID__ por
 * una cadena entrecomillada (typeof es seguro: sin reemplazo, el identificador no está declarado).
 * Caché con nombre POR VERSIÓN → en activate se purgan 'brigada-v1' y versiones anteriores. */
const VERSION = typeof __BUILD_ID__ !== 'undefined' ? String(__BUILD_ID__) : 'v1'
const CACHE = `nfpa-brigada-${VERSION}`
const PRECACHE = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png', '/icons/icon-512.png']
const DB_NAME = 'nfpa_brigada10'
const DB_VERSION = 1
const API_PATH = '/api/'
const SYNC_TAG = 'nfpa-sync'

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.registration.sync && self.registration.sync.register(SYNC_TAG))
      .catch(() => {}),
  )
})

function esDeViteDev(url) {
  return url.pathname.startsWith('/@') || url.pathname.includes('/src/') || url.pathname.startsWith('/node_modules/')
}

async function respondeConCachePrimera(request) {
  const cache = await caches.open(CACHE)
  const golpe = await cache.match(request)
  if (golpe) {
    fetch(request)
      .then((fresh) => {
        if (fresh && fresh.ok) cache.put(request, fresh.clone())
      })
      .catch(() => {})
    return golpe
  }
  try {
    const red = await fetch(request)
    if (red && red.ok && request.method === 'GET') cache.put(request, red.clone())
    return red
  } catch (e) {
    if (request.mode === 'navigate') {
      const shell = await cache.match('/')
      if (shell) return shell
    }
    throw e
  }
}

async function respondeApiRedPrimera(request) {
  try {
    const red = await fetch(request.clone())
    const cache = await caches.open(CACHE)
    if (red && red.ok && request.method === 'GET') cache.put(request, red.clone())
    return red
  } catch (e) {
    if (request.method === 'GET') {
      const cache = await caches.open(CACHE)
      const golpe = await cache.match(request)
      if (golpe) return golpe
    }
    return new Response(JSON.stringify({ message: 'sin conexión', offline: true }), {
      status: 503,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET' && req.method !== 'HEAD') return
  const url = new URL(req.url)
  const esApi = url.pathname.startsWith(API_PATH) || url.port === '3200'
  if (esApi) {
    event.respondWith(respondeApiRedPrimera(req))
    return
  }
  if (url.origin !== self.location.origin) return
  if (esDeViteDev(url)) return // no interferir con HMR en desarrollo
  if (req.mode === 'navigate') {
    event.respondWith(respondeNavegacion(req))
    return
  }
  event.respondWith(respondeConCachePrimera(req))
})

async function respondeNavegacion(request) {
  try {
    const red = await fetch(request)
    const cache = await caches.open(CACHE)
    if (red && red.ok) cache.put('/index.html', red.clone())
    return red
  } catch (e) {
    const shell = await (await caches.open(CACHE)).match('/index.html')
    if (shell) return shell
    throw e
  }
}

/* ---------- cola de inspecciones (mismo esquema que src/lib/offline.ts) ---------- */

function abrirDB() {
  return new Promise((resolve, reject) => {
    const p = indexedDB.open(DB_NAME, DB_VERSION)
    p.onupgradeneeded = () => {
      const db = p.result
      if (!db.objectStoreNames.contains('cola_inspecciones')) {
        const s = db.createObjectStore('cola_inspecciones', { keyPath: 'id', autoIncrement: true })
        s.createIndex('by_estado', 'estado')
      }
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'key' })
    }
    p.onsuccess = () => resolve(p.result)
    p.onerror = () => reject(p.error)
  })
}

function tx1(db, store, modo, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, modo)
    const rq = fn(t.objectStore(store))
    t.oncomplete = () => resolve(rq && rq.result)
    t.onerror = () => reject(t.error)
    t.onabort = () => reject(t.error)
  })
}

async function vaciarCola() {
  let db
  try {
    db = await abrirDB()
  } catch (e) {
    return
  }
  const apiBase = (await tx1(db, 'settings', 'readonly', (s) => s.get('apiBase'))) || { value: 'http://localhost:3200/api/v1' }
  const tokenRow = await tx1(db, 'settings', 'readonly', (s) => s.get('token'))
  const items = (await tx1(db, 'cola_inspecciones', 'readonly', (s) => s.getAll())) || []
  const ahora = Date.now()
  for (const item of items) {
    if (!item || item.siguiente_en > ahora) continue
    try {
      const res = await fetch(`${apiBase.value}/inspections`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tokenRow && tokenRow.value ? { Authorization: `Bearer ${tokenRow.value}` } : {}),
        },
        body: JSON.stringify(item.payload),
      })
      if (res.ok) {
        await tx1(db, 'cola_inspecciones', 'readwrite', (s) => s.delete(item.id))
      } else if (res.status < 500) {
        // error de validación: no reintentar infinito
        item.estado = 'error'
        item.ultimo_error = `HTTP ${res.status}`
        item.siguiente_en = Date.now() + 30 * 60_000
        await tx1(db, 'cola_inspecciones', 'readwrite', (s) => s.put(item))
      } else {
        item.intentos = (item.intentos || 0) + 1
        item.siguiente_en = Date.now() + Math.min(5000 * 2 ** item.intentos, 300000)
        await tx1(db, 'cola_inspecciones', 'readwrite', (s) => s.put(item))
      }
    } catch (e) {
      item.intentos = (item.intentos || 0) + 1
      item.siguiente_en = Date.now() + Math.min(5000 * 2 ** item.intentos, 300000)
      await tx1(db, 'cola_inspecciones', 'readwrite', (s) => s.put(item)).catch(() => {})
    }
  }
  db.close()
}

self.addEventListener('sync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(vaciarCola())
})

self.addEventListener('online', () => {
  self.waitUntil(vaciarCola())
})
