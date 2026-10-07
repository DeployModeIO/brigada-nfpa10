/**
 * Listas desplegables configurables (tipos de extintor y ubicaciones).
 * Espejo local (fallback offline) de configTipos[]/configUbicaciones[] persistidas en el
 * servidor vía PATCH /settings. Alimentan los <select> del alta de extintores hasta que
 * llegan las listas del server.
 */
export const KEY_TIPOS = 'nfpa_config_tipos'
export const KEY_UBICACIONES = 'nfpa_config_ubicaciones'
export const KEY_HALLAZGOS = 'nfpa_config_hallazgos'

export const TIPOS_INICIALES = ['PQS 4 kg', 'PQS 6 kg', 'CO2 6 kg', 'Agua presurizada 9 L', 'PQS 20 kg (carro)']
export const UBICACIONES_INICIALES = ['Bodega A', 'Bodega B', 'Cocina industrial', 'Sala eléctrica', 'Recepción', 'Estacionamiento']

/** Catálogo de hallazgos de terreno (NFPA 10 §7.2/§7.3 + API RP 14G). Editable por el admin. */
export const HALLAZGOS_INICIALES = [
  'Sello o precinto de seguridad roto o ausente',
  'Manómetro en zona roja (presión baja)',
  'Manómetro en zona roja (sobrepresión)',
  'Manómetro dañado, vencido o ilegible',
  'Prueba de presión (hidrostática) vencida',
  'Recarga de agente vencida (+12 meses)',
  'Óxido o corrosión visible en el cuerpo',
  'Abolladuras o golpes en el cilindro',
  'Manguera fisurada, cortada o endurecida',
  'Tobera o difusor obstruido o faltante',
  'Válvula con fuga o dañada',
  'Pasador de seguridad ausente',
  'Agente compactado o apelmazado (PQS)',
  'Tarjeta/etiqueta de inspección ilegible',
  'Señalización del equipo ausente o ilegible',
  'Acceso al equipo obstruido',
  'Soporte flojo, ausente o fuera de altura',
  'Tipo de extintor incorrecto para el riesgo',
  'Cuerpo repintado (pintura no de fábrica)',
  'SCBA con carga de cilindro insuficiente',
]

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

export function leerHallazgos(): string[] {
  return leer(KEY_HALLAZGOS, HALLAZGOS_INICIALES)
}

export function escribirHallazgos(v: string[]): void {
  try {
    localStorage.setItem(KEY_HALLAZGOS, JSON.stringify(v))
  } catch {
    /* ignore */
  }
}
