/**
 * Semáforo NFPA 10 — tipos REALES del backend (:3200) y configuración de las 4 categorías.
 * src/lib/types.ts no coincide con la respuesta real de GET /alerts/panel (arrays + cont{v,g,r,n}),
 * por eso estos tipos viven aquí; alerts y export los importan.
 */
import type { ComponentType } from 'react'
import { AlertIcon, CheckIcon } from '../../components/icons'
import { ClockIconFallback } from './iconos'

export type ClaveColor = 'verde' | 'amarillo' | 'rojo' | 'negro'

export interface PanelItem {
  tag: string
  ubicacion: string
  tipo: string
  capacidad_l: number | null
  proximo_vencimiento: string | null
  estado_inspeccion: string
  rechazado: boolean
  estadoCalculado: 'vigente' | 'por_vencer' | 'vencido' | 'rechazado'
}

export interface PanelReal {
  verde: PanelItem[]
  amarillo: PanelItem[]
  rojo: PanelItem[]
  negro: PanelItem[]
  cont: { v: number; g: number; r: number; n: number }
}

export interface Categoria {
  clave: ClaveColor
  etiqueta: string
  descripcion: string
  icono: ComponentType<{ size?: number; className?: string }>
  claseTexto: string
  claseTarjeta: string
  clasePunto: string
}

export const CATEGORIAS: Categoria[] = [
  {
    clave: 'verde',
    etiqueta: 'Vigente',
    descripcion: 'Dentro de fecha',
    icono: CheckIcon,
    claseTexto: 'text-ok',
    claseTarjeta: 'border-ok',
    clasePunto: 'bg-ok',
  },
  {
    clave: 'amarillo',
    etiqueta: 'Por vencer',
    descripcion: 'Vence en 7 días o menos',
    icono: ClockIconFallback,
    claseTexto: 'text-warn',
    claseTarjeta: 'border-warn',
    clasePunto: 'bg-warn',
  },
  {
    clave: 'rojo',
    etiqueta: 'Vencido',
    descripcion: 'Vencimiento superado',
    icono: AlertIcon,
    claseTexto: 'text-err',
    claseTarjeta: 'border-err',
    clasePunto: 'bg-err',
  },
  {
    clave: 'negro',
    etiqueta: 'Rechazado',
    descripcion: 'Baja por falla crítica',
    icono: AlertIcon,
    claseTexto: 'text-err',
    // negro = superficie más oscura del tema + borde err + icono + texto (jamás solo color)
    claseTarjeta: 'bg-bg2 border-2 border-err',
    clasePunto: 'bg-text',
  },
]

export function categoriaDe(clave: ClaveColor): Categoria {
  return CATEGORIAS.find((c) => c.clave === clave) ?? CATEGORIAS[0]
}

export function esClaveColor(v: string | null | undefined): v is ClaveColor {
  return v === 'verde' || v === 'amarillo' || v === 'rojo' || v === 'negro'
}

export function contDe(panel: PanelReal, clave: ClaveColor): number {
  return { verde: panel.cont.v, amarillo: panel.cont.g, rojo: panel.cont.r, negro: panel.cont.n }[clave]
}

/** lee un token de diseño (--ok, --err…) resuelto en runtime — para canvas y pdfmake. */
export function cssVar(nombre: 'primary' | 'ok' | 'warn' | 'err' | 'info' | 'text' | 'text2' | 'border' | 'surface' | 'bg'): string {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${nombre}`).trim() || '#888888'
}

export function fechaCorta(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

export const MESES_LARGOS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

export function diasHasta(iso: string | null): number | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return Math.ceil((d.getTime() - Date.now()) / 86400000)
}

export function venceEn7Dias(iso: string | null): boolean {
  const n = diasHasta(iso)
  return n !== null && n <= 7
}
