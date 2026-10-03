/**
 * Listas desplegables configurables (tipos de extintor y ubicaciones).
 * Espejo local (fallback offline) de configTipos[]/configUbicaciones[] persistidas en el
 * servidor vía PATCH /settings. Alimentan los <select> del alta de extintores hasta que
 * llegan las listas del server.
 */
export const KEY_TIPOS = 'nfpa_config_tipos'
export const KEY_UBICACIONES = 'nfpa_config_ubicaciones'

export const TIPOS_INICIALES = ['PQS 4 kg', 'PQS 6 kg', 'CO2 6 kg', 'Agua presurizada 9 L', 'PQS 20 kg (carro)']
export const UBICACIONES_INICIALES = ['Bodega A', 'Bodega B', 'Cocina industrial', 'Sala eléctrica', 'Recepción', 'Estacionamiento']

function leer(clave: string, fallback: string[]): string[] {
  try {
    const raw = localStorage.getItem(clave)
    if (raw) {
      const arr = JSON.parse(raw)
      if (Array.isArray(arr)) return arr.filter((v): v is string => typeof v === 'string')
    }
  } catch {
    /* ignore */
  }
  return [...fallback]
}

export function leerTipos(): string[] {
  return leer(KEY_TIPOS, TIPOS_INICIALES)
}

export function leerUbicaciones(): string[] {
  return leer(KEY_UBICACIONES, UBICACIONES_INICIALES)
}

export function escribirTipos(v: string[]): void {
  try {
    localStorage.setItem(KEY_TIPOS, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}

export function escribirUbicaciones(v: string[]): void {
  try {
    localStorage.setItem(KEY_UBICACIONES, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}
