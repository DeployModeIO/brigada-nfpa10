/**
 * Capa offline: IndexedDB vía idb.
 * Stores: cola_inspecciones (sync pendiente con retry exponencial), cache_extintores, settings.
 * El service worker lee este mismo esquema con indexedDB nativo (ver src/service-worker.js).
 * MODO DEMO (VITE_DEMO==='1', file://): cada función es un no-op — IndexedDB está bloqueado
 * en muchos navegadores bajo file:// y la persistencia real la da demoMock (localStorage).
 */
import { openDB, type IDBPDatabase } from 'idb'
import { api, DEMO_MODE } from './api'
import type { Extinguisher, InspectionPayload } from './types'

export const DB_NAME = 'brigada-nfpa10'
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

export async function enqueueInspection(payload: InspectionPayload): Promise<number | undefined> {
  if (DEMO_MODE) return undefined
  const db = await getDB()
  const item: ColaItem = {
    payload,
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

export interface DrainResult {
  ok: number
  fallidas: number
  pendientes: number
}

/** Sincroniza la cola contra POST /inspections con retry exponencial por ítem. */
export async function drainQueue(client = api): Promise<DrainResult> {
  if (DEMO_MODE) return { ok: 0, fallidas: 0, pendientes: 0 }
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
