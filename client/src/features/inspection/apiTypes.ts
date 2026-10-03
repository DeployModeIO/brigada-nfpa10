/**
 * DTOs reales del contrato verificados contra backend :3200 (server/src/routes).
 * Nota: difieren de src/lib/types.ts en nombres que devuelven las rutas (estadoCalculado,
 * resultados como mapa {clave:boolean}, activo como 0/1). Aquí se describe la respuesta real.
 */
import { ApiError } from '../../lib/api'

export type EstadoCalculado = 'vigente' | 'por_vencer' | 'vencido' | 'rechazado' | 'sin_inspeccionar'

export interface ExtDto {
  tag: string
  ubicacion: string
  tipo: string
  capacidad_l: number | null
  presion_bar: number | null
  fecha_fabricacion: string | null
  ultima_inspeccion: string | null
  proximo_vencimiento: string | null
  estado_inspeccion: string
  rechazado: boolean
  notas: string | null
  lat: number | null
  lng: number | null
  estadoCalculado: EstadoCalculado | string
}

export interface ChecklistRow {
  id: number
  clave: string
  etiqueta: string
  orden: number
  activo: number
}

export interface InspRow {
  id: number
  tag: string
  resultados: Record<string, boolean>
  fallas: string[]
  criticas_fallan: number
  observaciones: string | null
  lat: number | null
  lng: number | null
  dispositivo: string | null
  inspector_username: string
  created_at: string
  tiene_foto: boolean
}

export interface Pag<T> {
  items: T[]
  total: number
  page: number
  size: number
}

/** Cuerpo exacto de POST /inspections (foto sin prefijo data: — el B64_RE del server lo rechaza). */
export interface InspeccionPayload {
  tag: string
  resultados: Record<string, boolean>
  observaciones?: string
  foto_evidencia_base64?: string
  gps?: { lat: number; lng: number }
  dispositivo?: string
}

export interface InspeccionCreada {
  id: number
  tag: string
  fecha: string
  proximo_vencimiento: string
  fallas: string[]
  criticas: string[]
  estado_inspeccion: string
  rechazado: boolean
}

/** Claves que producen rechazo según el seed documentado (server/docs/API.md §Checklist). */
export const CRITICAS = new Set(['presion_rango', 'precinto_intacto', 'manguera_sin_fisuras'])

export function msgError(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.detail as { msg?: string } | null
    if (d && typeof d.msg === 'string' && d.msg) return d.msg
    return e.message
  }
  return e instanceof Error ? e.message : String(e)
}

export function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' })
  } catch {
    return iso
  }
}

export function fechaHora(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}
