/** Tipos locales de /settings y /extinguishers del backend :3200 (el contrato compartido vive en src/lib/types.ts). */

export interface SettingsReal {
  appName: string
  logoDataUrl: string
  temaDefault: 'dark' | 'light'
  webhookUrl: string
  webhookApi: string
  brand: { primary: string; ok: string; warn: string; err: string; info: string }
  configTipos?: string[]
  configUbicaciones?: string[]
}

export type EstadoCalculadoReal = 'vigente' | 'por_vencer' | 'vencido' | 'rechazado' | 'sin_inspeccionar'

export interface ExtinguisherReal {
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
  activo: number
  estadoCalculado: EstadoCalculadoReal
}

export interface RespuestaPaginada<T> {
  items: T[]
  total: number
  page: number
  size: number
}
