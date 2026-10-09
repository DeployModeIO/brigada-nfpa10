/**
 * Lógica PURA del mapa REAL /planta (Leaflet + OpenStreetMap, decisión docs/adr/ADR-001).
 * Sin DOM: filtra coordenadas utilizables, arma los puntos del mapa y el deep-link a Google
 * Maps. Todo determinista para poder probarse en node (tests/mapaGeo.test.mjs).
 */
import type { Extinguisher } from '../../lib/types'

/** Punto geográfico de un extintor con coordenadas válidas. */
export interface PuntoGeo {
  tag: string
  lat: number
  lng: number
  estado: string
  ubicacion: string
}

/**
 * true si lat/lng son números finitos dentro del rango geográfico válido.
 * Descarta NaN, Infinity, null y valores fuera de [-90,90] / [-180,180].
 */
export function coordValida(lat: unknown, lng: unknown): boolean {
  const la = typeof lat === 'string' ? Number(lat) : (lat as number)
  const lo = typeof lng === 'string' ? Number(lng) : (lng as number)
  return (
    Number.isFinite(la) &&
    Number.isFinite(lo) &&
    la >= -90 &&
    la <= 90 &&
    lo >= -180 &&
    lo <= 180
  )
}

/** item → PuntoGeo si tiene coordenadas utilizables; null si no. */
export function puntoGeoDe(e: Extinguisher): PuntoGeo | null {
  if (!coordValida(e.lat, e.lng)) return null
  return {
    tag: String(e.tag),
    lat: Number(e.lat),
    lng: Number(e.lng),
    estado: String(e.estadoCalculado || 'sin_inspeccionar'),
    ubicacion: e.ubicacion || '',
  }
}

/** Equipos → puntos con coordenadas válidas, ordenados por tag (determinista). */
export function puntosGeoDe(items: Extinguisher[]): PuntoGeo[] {
  return [...items]
    .sort((a, b) => String(a.tag).localeCompare(String(b.tag)))
    .map(puntoGeoDe)
    .filter((p): p is PuntoGeo => p !== null)
}

/** Cuántos equipos NO tienen coordenadas utilizables (no se pintan en el mapa real). */
export function sinCoordenadas(items: Extinguisher[]): number {
  return items.filter((e) => !coordValida(e.lat, e.lng)).length
}

/**
 * Deep-link al Google Maps del dispositivo en las coordenadas dadas. Abierto en pestaña
 * nueva; en el WebView de Android se resuelve con la app/URL de Google Maps del teléfono.
 */
export function mapsUrlPara(lat: number, lng: number): string {
  return `https://www.google.com/maps?q=${lat},${lng}`
}

/** Etiqueta humana del semáforo (para el popup del mapa real). */
export function etiquetaEstado(estado: string): string {
  switch (estado) {
    case 'vigente': return 'Vigente'
    case 'por_vencer': return 'Por vencer'
    case 'vencido': return 'Vencido'
    case 'rechazado': return 'Rechazado (NO APTO)'
    default: return 'Sin inspeccionar'
  }
}

/** Escapa texto para inyectarlo con seguridad en innerHTML del popup de Leaflet. */
export function escaparHtml(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}