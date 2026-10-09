/**
 * Exportación de capturas de terreno (MODO_CAPTURA). Lógica PURA y testeable en node
 * (construirExport / nombreArchivoExport) + helpers de navegador (descargarExport /
 * compartirExport) para transferir el lote JSON al PC de forma MANUAL. No sube nada.
 */
import type { ColaItem } from '../../lib/offline'

// Reexport del helper puro del modo para que el bundle de test lo exponga junto al resto.
export { esModoCaptura } from '../../lib/modo'

export interface ExportItem {
  captura_id: string
  creado_en: string
  tag: string
  resultados: Record<string, boolean>
  observaciones?: string | null
  foto_evidencia_base64?: string | null
  gps?: { lat: number; lng: number } | null
  dispositivo?: string | null
}

export interface ExportLote {
  schema: 'brigada.export/v1'
  generado_en: string
  dispositivo: string
  inspector_username: string
  app_version: string
  total: number
  items: ExportItem[]
}

export interface ExportOpts {
  inspectorUsername: string
  dispositivo: string
  appVersion: string
  incluirFotos: boolean
}

/** UUID con respaldo (mismo criterio que offline.ts) para capturas sin captura_id. */
function nuevoUuid(): string {
  try {
    const c = (globalThis as { crypto?: { randomUUID?: () => string } }).crypto
    if (c?.randomUUID) return c.randomUUID()
  } catch {
    /* crypto no disponible */
  }
  return `cap-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Mapea los ítems de la cola a un lote exportable. Ambas marcas (captura_id/creado_en)
 * se garantizan; si faltan se generan respaldos (creado_en cae a la fecha de encolado).
 * Con incluirFotos=false se descarta la evidencia fotográfica.
 */
export function construirExport(items: ColaItem[], opts: ExportOpts): ExportLote {
  const mapped: ExportItem[] = items.map((it) => {
    const p = it.payload
    return {
      captura_id: p.captura_id || nuevoUuid(),
      creado_en: p.creado_en || new Date(it.creado_en || Date.now()).toISOString(),
      tag: p.tag,
      resultados: p.resultados ?? {},
      observaciones: p.observaciones ?? null,
      foto_evidencia_base64: opts.incluirFotos ? p.foto_evidencia_base64 ?? null : null,
      gps: p.gps ?? null,
      dispositivo: p.dispositivo ?? null,
    }
  })
  return {
    schema: 'brigada.export/v1',
    generado_en: new Date().toISOString(),
    dispositivo: opts.dispositivo,
    inspector_username: opts.inspectorUsername,
    app_version: opts.appVersion,
    total: mapped.length,
    items: mapped,
  }
}

/** Nombre de fichero determinista: brigada-terreno-YYYYMMDD-HHmm.json (hora local). */
export function nombreArchivoExport(fecha: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  const y = fecha.getFullYear()
  const md = `${p(fecha.getMonth() + 1)}${p(fecha.getDate())}`
  const hm = `${p(fecha.getHours())}${p(fecha.getMinutes())}`
  return `brigada-terreno-${y}${md}-${hm}.json`
}

/** Descarga el lote como archivo JSON (Blob + <a download>). Helper de navegador. */
export function descargarExport(lote: ExportLote, fecha?: Date): void {
  const blob = new Blob([JSON.stringify(lote, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivoExport(fecha)
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

/**
 * Comparte el lote vía Web Share (con File si el navegador lo soporta) o, si no,
 * cae a descargarExport. Devuelve cómo se entregó para informar en la UI.
 */
export async function compartirExport(lote: ExportLote): Promise<'compartido' | 'descargado'> {
  const nombre = nombreArchivoExport()
  const json = JSON.stringify(lote, null, 2)
  try {
    const nav = (globalThis as { navigator?: unknown }).navigator as
      | { canShare?: (d?: unknown) => boolean; share?: (d: unknown) => Promise<void> }
      | undefined
    if (nav?.share && typeof File !== 'undefined') {
      const file = new File([json], nombre, { type: 'application/json' })
      if (!nav.canShare || nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title: 'Capturas de terreno', text: `Brigada NFPA-10 — ${lote.total} captura(s)` })
        return 'compartido'
      }
    }
  } catch {
    /* compartir cancelado o no soportado: se descarga */
  }
  descargarExport(lote)
  return 'descargado'
}