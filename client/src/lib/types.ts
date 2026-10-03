/**
 * Tipos del contrato API — compartidos por todos los features.
 * Alineados con las rutas reales de server/src/routes y server/docs/API.md.
 * Los features conservan sus tipos locales (apiTypes.ts / tipos.ts); estos son el contrato.
 */

export type EstadoCalculado = 'vigente' | 'por_vencer' | 'vencido' | 'rechazado' | 'sin_inspeccionar'

/** Extintor como lo devuelve GET/PATCH /extinguishers* (con estadoCalculado calculado por el server). */
export interface Extinguisher {
  tag: string
  ubicacion: string
  tipo: string
  capacidad_l: number | null
  presion_bar: number | null
  fecha_fabricacion: string | null
  ultima_inspeccion: string | null
  proximo_vencimiento: string | null
  estado_inspeccion: 'pasa' | 'falla' | 'n_a' | string
  rechazado: boolean
  notas: string | null
  lat: number | null
  lng: number | null
  activo?: number | boolean
  created_at?: string
  updated_at?: string
  estadoCalculado: EstadoCalculado | string
}

/** Fila de GET /checklist-items (activo llega 0/1 crudo de la BD). */
export interface ChecklistItem {
  id: number
  clave: string
  etiqueta: string
  orden: number
  activo: number
}

export interface GpsFix {
  lat: number
  lng: number
}

/** Cuerpo real de POST /inspections (claves de resultados ausentes = falla). */
export interface InspectionPayload {
  tag: string
  resultados: Record<string, boolean>
  observaciones?: string | null
  /** base64 sin prefijo `data:` (B64_RE del server lo rechaza con prefijo), máx ~4M chars */
  foto_evidencia_base64?: string | null
  gps?: GpsFix | null
  dispositivo?: string | null
}

/** Resumen 201 de POST /inspections. */
export interface InspectionAck {
  id: number
  tag: string
  fecha: string
  proximo_vencimiento: string
  resultados: Record<string, boolean>
  fallas: string[]
  criticas: string[]
  estado_inspeccion: 'pasa' | 'falla'
  rechazado: boolean
}

/** Fila real de GET /inspections (lista: tiene_foto) y GET /inspections/:id (trae `foto`). */
export interface Inspection {
  id: number
  tag: string
  resultados: Record<string, boolean>
  fallas: string[]
  criticas_fallan: number
  observaciones: string | null
  lat: number | null
  lng: number | null
  dispositivo: string | null
  inspector_id: number | null
  inspector_username: string
  created_at: string
  tiene_foto?: boolean
  foto?: string | null
}

export interface Paginated<T> {
  items: T[]
  total: number
  page: number
  size: number
}

/** Ítem del semáforo GET /alerts/panel. */
export interface PanelItem {
  tag: string
  ubicacion: string
  tipo: string
  capacidad_l: number | null
  proximo_vencimiento: string | null
  estado_inspeccion: string
  rechazado: boolean
  estadoCalculado: EstadoCalculado | string
}

/** GET /alerts/panel: arrays por color + contadores {v,g,r,n}. */
export interface PanelAlertas {
  verde: PanelItem[]
  amarillo: PanelItem[]
  rojo: PanelItem[]
  negro: PanelItem[]
  cont: { v: number; g: number; r: number; n: number }
}

/** GET /public-config y GET /settings. */
export interface PublicConfig {
  appName: string
  logoDataUrl?: string | null
  brand?: Record<string, string> | null
  temaDefault?: 'dark' | 'light'
  webhookUrl?: string
  webhookApi?: string
  configTipos?: string[]
  configUbicaciones?: string[]
}

/** Usuario vista cliente (mapeado desde `user.username` del API). */
export interface Usuario {
  id: number
  usuario: string
  nombre: string
  rol: string
}

/** POST /auth/login y GET /auth/me — forma cruda del API. */
export interface LoginResponse {
  token: string
  user: { id: number; username: string; nombre: string; rol: string }
}
