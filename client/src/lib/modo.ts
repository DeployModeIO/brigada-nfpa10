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