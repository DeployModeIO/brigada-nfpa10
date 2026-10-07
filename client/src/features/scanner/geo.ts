/**
 * Geolocalización de inspecciones — verificación anti-fraude Oil & Gas.
 * Compara la posición GPS capturada en campo con la ubicación registrada
 * del equipo: si la distancia es anómala, la inspección queda marcada
 * para revisión (el equipo pudo ser movido o la inspección es remota).
 */

export interface Coordenadas {
  lat: number
  lng: number
}

const RADIO_TIERRA_M = 6_371_000
const GRAD = Math.PI / 180

/** Distancia haversine en metros entre dos coordenadas WGS84. */
export function distanciaMetros(a: Coordenadas, b: Coordenadas): number {
  const dLat = (b.lat - a.lat) * GRAD
  const dLng = (b.lng - a.lng) * GRAD
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * GRAD) * Math.cos(b.lat * GRAD) * Math.sin(dLng / 2) ** 2
  return 2 * RADIO_TIERRA_M * Math.asin(Math.min(1, Math.sqrt(s)))
}

/** Umbral por defecto de coincidencia entre GPS de campo y ubicación registrada. */
export const UMBRAL_COINCIDENCIA_M = 100

export type CoincidenciaGps = {
  distanciaM: number
  coincidente: boolean
  /** Etiqueta lista para UI: coincide / desviación a revisar. */
  etiqueta: string
}

export function verificarCoincidenciaGps(
  gps: Coordenadas,
  registrada: Coordenadas | null | undefined,
  umbralM = UMBRAL_COINCIDENCIA_M,
): CoincidenciaGps | null {
  if (!registrada || !Number.isFinite(registrada.lat) || !Number.isFinite(registrada.lng)) return null
  if (!Number.isFinite(gps.lat) || !Number.isFinite(gps.lng)) return null
  const distanciaM = Math.round(distanciaMetros(gps, registrada))
  const coincidente = distanciaM <= umbralM
  return {
    distanciaM,
    coincidente,
    etiqueta: coincidente
      ? `Ubicación coincidente con el registro del equipo (±${distanciaM} m)`
      : `⚠ Desviación de ${distanciaM} m respecto a la ubicación registrada — verificar traslado del equipo`,
  }
}
