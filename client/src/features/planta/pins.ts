/**
 * Lógica PURA del mapa /planta (spec pantalla 9): ubicación de pines por estado
 * (verde/ámbar/rojo/negro), filtro por área/nave y orden determinista — testeable
 * en node sin DOM. Los colores salen de tokens CSS (var(--ok) etc.), nunca hex suelto.
 */
import type { Extinguisher } from '../../lib/types'

export interface Pin {
  tag: string
  /** coords en viewBox 0..100 (normalizadas desde lat/lng, o grilla determinista) */
  x: number
  y: number
  estado: string
  ubicacion: string
  agente: string
  r: number
}

export function areaDe(e: { ubicacion?: string; metadata?: Record<string, unknown> | null }): string {
  const md = (e.metadata || {}) as { area?: string; ubicacion_detalle?: { nave?: string } }
  if (md.area) return String(md.area)
  const det = md.ubicacion_detalle as { nave?: string } | undefined
  if (det?.nave) return String(det.nave)
  const u = String(e.ubicacion || '').trim()
  const m = u.split(/\s*[（(]\s*|\s+[-—–]\s+/)[0].trim()
  return m || 'SIN ÁREA'
}

/** Color del pin por estadoCalculado (semáforo de 4 + gris sin inspeccionar). */
export function colorDe(estado: string): string {
  if (estado === 'vigente') return 'var(--ok)'
  if (estado === 'por_vencer') return 'var(--warn)'
  if (estado === 'vencido') return 'var(--err)'
  if (estado === 'rechazado') return 'var(--text)' // negro del tema
  return 'var(--text2)'
}

function hash(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967295
}

function radio(cap: number | null | undefined): number {
  const c = Number(cap)
  if (!Number.isFinite(c) || c <= 0) return 1.7
  if (c <= 4.5) return 1.5
  if (c <= 9) return 1.8
  return 2.2
}

/**
 * items → pins. Con lat/lng: proyección lineal normalizada al cuadro [8..92].
 * Sin coordenadas: grilla 8 columnas determinista por tag (orden alfabético).
 */
export function pinsDe(items: Extinguisher[]): Pin[] {
  const sorted = [...items].sort((a, b) => String(a.tag).localeCompare(String(b.tag)))
  const conCoord = sorted.filter((e) => Number.isFinite(e.lat as number) && Number.isFinite(e.lng as number))
  const out: Pin[] = []
  if (conCoord.length) {
    const lats = conCoord.map((e) => e.lat as number)
    const lngs = conCoord.map((e) => e.lng as number)
    const minLa = Math.min(...lats), maxLa = Math.max(...lats)
    const minLo = Math.min(...lngs), maxLo = Math.max(...lngs)
    const spanLa = maxLa - minLa || 1
    const spanLo = maxLo - minLo || 1
    for (const e of conCoord) {
      out.push({
        tag: e.tag,
        x: 8 + ((e.lng as number) - minLo) / spanLo * 84,
        y: 8 + (1 - ((e.lat as number) - minLa) / spanLa) * 84,
        estado: String(e.estadoCalculado || 'sin_inspeccionar'),
        ubicacion: e.ubicacion || '',
        agente: e.agente || e.tipo || '',
        r: radio(e.capacidad_l),
      })
    }
  }
  const sinCoord = sorted.filter((e) => !Number.isFinite(e.lat as number) || !Number.isFinite(e.lng as number))
  sinCoord.forEach((e, i) => {
    const jitter = hash(e.tag) * 3
    out.push({
      tag: e.tag,
      x: 12 + ((i % 8) * 11) + jitter,
      y: 14 + Math.floor(i / 8) * 11 + jitter,
      estado: String(e.estadoCalculado || 'sin_inspeccionar'),
      ubicacion: e.ubicacion || '',
      agente: e.agente || e.tipo || '',
      r: radio(e.capacidad_l),
    })
  })
  return out
}

export function filtrarPins(items: Extinguisher[], filtroArea: string, filtroEstado: string): Extinguisher[] {
  return items.filter((e) => {
    if (filtroArea && areaDe(e) !== filtroArea) return false
    if (filtroEstado && String(e.estadoCalculado) !== filtroEstado) return false
    return true
  })
}

export function areasDe(items: Extinguisher[]): string[] {
  return [...new Set(items.map(areaDe))].sort((a, b) => a.localeCompare(b))
}
