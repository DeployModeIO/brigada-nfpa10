/**
 * Capa offline: IndexedDB vía idb.
 * Stores: cola_inspecciones (sync pendiente con retry exponencial), cache_extintores, settings.
 * El service worker lee este mismo esquema con indexedDB nativo (ver src/service-worker.js).
 * MODO DEMO (VITE_DEMO==='1', file://): cada función es un no-op — IndexedDB está bloqueado
 * en muchos navegadores bajo file:// y la persistencia real la da demoMock (localStorage).
 */
import { openDB, type IDBPDatabase } from 'idb'
import { api, DEMO_MODE } from './api'
import { MODO_CAPTURA } from './modo'
import type { Extinguisher, InspectionPayload } from './types'

export const DB_NAME = 'nfpa_brigada10'
export const DB_VERSION = 1
export const STORE_COLA = 'cola_inspecciones'
export const STORE_CACHE = 'cache_extintores'
export const STORE_SETTINGS = 'settings'

export type ColaEstado = 'pending' | 'error'

export interface ColaItem {
  id?: number
  payload: InspectionPayload
  estado: ColaEstado
  intentos: number
  siguiente_en: number
  creado_en: number
  ultimo_error?: string
}

let dbPromise: Promise<IDBPDatabase> | null = null

export function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_COLA)) {
          const s = db.createObjectStore(STORE_COLA, { keyPath: 'id', autoIncrement: true })
          s.createIndex('by_estado', 'estado')
        }
        if (!db.objectStoreNames.contains(STORE_CACHE)) {
          db.createObjectStore(STORE_CACHE, { keyPath: 'tag' })
        }
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
          db.createObjectStore(STORE_SETTINGS, { keyPath: 'key' })
        }
      },
    })
  }
  return dbPromise
}

const BASE_RETRY_MS = 5_000
const MAX_RETRY_MS = 5 * 60_000

export function backoffMs(intentos: number): number {
  return Math.min(BASE_RETRY_MS * 2 ** intentos, MAX_RETRY_MS)
}

/** Genera un id de captura: crypto.randomUUID con respaldo si no está disponible. */
function nuevoUuid(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
    if (c?.randomUUID) return c.randomUUID()
  } catch {
    /* crypto no disponible (contexto no seguro): usar respaldo */
  }
  return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/** Garantiza captura_id/creado_en en el payload (sin pisar los ya presentes). */
export function marcarCaptura<T extends InspectionPayload>(payload: T): T {
  return {
    ...payload,
    captura_id: payload.captura_id || nuevoUuid(),
    creado_en: payload.creado_en || new Date().toISOString(),
  }
}

export async function enqueueInspection(payload: InspectionPayload): Promise<number | undefined> {
  if (DEMO_MODE) return undefined
  const db = await getDB()
  const item: ColaItem = {
    // MODO_CAPTURA: cada captura de terreno queda marcada con id y fecha para el export.
    payload: MODO_CAPTURA ? marcarCaptura(payload) : payload,
    estado: 'pending',
    intentos: 0,
    siguiente_en: Date.now(),
    creado_en: Date.now(),
  }
  const id = await db.add(STORE_COLA, item)
  return id as number
}

export async function pendingCount(): Promise<number> {
  if (DEMO_MODE) return 0
  const db = await getDB()
  return db.count(STORE_COLA)
}

/** Devuelve todos los ítems de la cola (para el historial local y el export de terreno). */
export async function listarCola(): Promise<ColaItem[]> {
  if (DEMO_MODE) return []
  const db = await getDB()
  return (await db.getAll(STORE_COLA)) as ColaItem[]
}

/** Cuenta los ítems de la cola sin cargarlos. */
export async function contarCola(): Promise<number> {
  if (DEMO_MODE) return 0
  const db = await getDB()
  return db.count(STORE_COLA)
}

/**
 * Solicita almacenamiento persistente (no purgable por el navegador) para no perder
 * capturas sin exportar. Best-effort: false si la API no existe o la deniegan.
 */
export async function pedirPersistencia(): Promise<boolean> {
  try {
    const storage = (globalThis as { navigator?: Navigator }).navigator?.storage as
      | (StorageManager & { persist?: () => Promise<boolean>; persisted?: () => Promise<boolean> })
      | undefined
    if (storage && typeof storage.persist === 'function') return await storage.persist()
    if (storage && typeof storage.persisted === 'function') return await storage.persisted()
  } catch {
    /* navegador sin StorageManager o permiso denegado */
  }
  return false
}

export interface DrainResult {
  ok: number
  fallidas: number
  pendientes: number
}

/** Sincroniza la cola contra POST /inspections con retry exponencial por ítem. */
export async function drainQueue(client = api): Promise<DrainResult> {
  if (DEMO_MODE) return { ok: 0, fallidas: 0, pendientes: 0 }
  // MODO_CAPTURA: la cola es un almacén durable de terreno; NUNCA se sube ni se borra aquí.
  // La transferencia al PC es 100% manual (export a fichero desde /exportar).
  if (MODO_CAPTURA) {
    const pendientes = await contarCola()
    return { ok: 0, fallidas: 0, pendientes }
  }
  const db = await getDB()
  const all = (await db.getAll(STORE_COLA)) as ColaItem[]
  const now = Date.now()
  let ok = 0
  let fallidas = 0
  for (const item of all) {
    if (item.siguiente_en > now) continue
    try {
      await client.post('/inspections', item.payload)
      await db.delete(STORE_COLA, item.id as IDBValidKey)
      ok += 1
    } catch (e) {
      fallidas += 1
      const intentos = item.intentos + 1
      const updated: ColaItem = {
        ...item,
        estado: 'error',
        intentos,
        siguiente_en: Date.now() + backoffMs(intentos),
        ultimo_error: e instanceof Error ? e.message : String(e),
      }
      await db.put(STORE_COLA, updated)
    }
  }
  const pendientes = ((await db.getAll(STORE_COLA)) as ColaItem[]).length
  return { ok, fallidas, pendientes }
}

export async function cachePut(tag: string, data: Extinguisher): Promise<void> {
  if (DEMO_MODE) return
  const db = await getDB()
  await db.put(STORE_CACHE, { ...data, tag, _cacheado_en: Date.now() })
}

export async function cacheGet(tag: string): Promise<Extinguisher | undefined> {
  if (DEMO_MODE) return undefined
  const db = await getDB()
  return db.get(STORE_CACHE, tag) as Promise<Extinguisher | undefined>
}

export async function cachePutMany(rows: Extinguisher[]): Promise<void> {
  if (DEMO_MODE) return
  const db = await getDB()
  const tx = db.transaction(STORE_CACHE, 'readwrite')
  await Promise.all(rows.map((r) => tx.store.put(r)))
  await tx.done
}

export async function cacheAllExtintores(): Promise<Extinguisher[]> {
  if (DEMO_MODE) return []
  const db = await getDB()
  return db.getAll(STORE_CACHE) as Promise<Extinguisher[]>
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  if (DEMO_MODE) return
  const db = await getDB()
  await db.put(STORE_SETTINGS, { key, value })
}

export async function getSetting<T = unknown>(key: string): Promise<T | undefined> {
  if (DEMO_MODE) return undefined
  const db = await getDB()
  const row = (await db.get(STORE_SETTINGS, key)) as { key: string; value: T } | undefined
  return row?.value
}
