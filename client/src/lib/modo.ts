/**
 * Modo "captura local" (bandera de COMPILACIÓN, no de runtime):
 * el dispositivo de terreno Android se compila con VITE_MODO_CAPTURA==='local'.
 * En ese modo las inspecciones se guardan SIEMPRE en la cola local (IndexedDB),
 * nunca se suben solas y se exportan a fichero para transferencia MANUAL al PC.
 * Con el modo apagado (valor ausente o distinto de 'local') TODO el comportamiento
 * online/offline existente queda intacto. No hay conmutador en runtime en esta oleada.
 */

function env(): Record<string, string | undefined> {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {}
}

/** Helper PURO (testeable en node sin import.meta): true solo si el valor es 'local'. */
export function esModoCaptura(valor: string | undefined): boolean {
  return valor === 'local'
}

/** Bandera de build: activa el flujo captura-local + exportación manual. */
export const MODO_CAPTURA: boolean = esModoCaptura(env().VITE_MODO_CAPTURA)

/** Milisegundos en un día (M4). */
const DIA_MS = 86_400_000

/**
 * M4: días de vida de la sesión permanente en captura-local. Default 30;
 * `VITE_SESION_DIAS` (entero > 0) lo sobreescribe. Helper PURO y testeable.
 */
export function diasSesionCaptura(valor: string | undefined, porDefecto = 30): number {
  const n = parseInt(String(valor ?? ''), 10)
  return Number.isFinite(n) && n > 0 ? n : porDefecto
}

/** Días de vigencia configurados para esta build (env de compilación). */
export const SESION_CAPTURA_DIAS: number = diasSesionCaptura(env().VITE_SESION_DIAS)

/**
 * M4: helper PURO de vigencia de la sesión de captura-local.
 * `desdeIso === null` ⇒ sesión sin inicio ⇒ vigente. Vencida cuando
 * `ahoraMs - Date.parse(desdeIso) > dias * 86400000`. Una fecha ilegible se trata como
 * ancla «ahora» (vigente): el llamador DEBE re-anclar con la hora actual usando
 * `anclaSesionLegible` (nunca expulsa al usuario por un ancla corrupta).
 */
export function sesionCapturaVigente(desdeIso: string | null, dias: number, ahoraMs: number): boolean {
  if (desdeIso === null) return true
  return !(ahoraMs - Date.parse(desdeIso) > dias * DIA_MS)
}

/**
 * M4 (fast-follow): true solo con un ancla LEGIBLE (string parseable como fecha).
 * `null`/undefined/ilegible ⇒ false ⇒ el llamador re-ancla la sesión con la hora actual.
 */
export function anclaSesionLegible(desdeIso: string | null | undefined): boolean {
  if (desdeIso == null) return false
  return Number.isFinite(Date.parse(desdeIso))
}