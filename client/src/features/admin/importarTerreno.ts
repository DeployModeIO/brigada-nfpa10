/**
 * Importación de capturas de terreno desde el PC (rol admin). Lógica PURA y testeable
 * en node: validación del lote exportado por la app Android (schema brigada.export/v1),
 * mapeo item → payload del endpoint POST /inspections/import, resumen de resultados y
 * hash best-effort del archivo. Sin DOM: la UI vive en ImportarTerrenoPage.tsx.
 */

/** Ítem de un lote exportado (contrato brigada.export/v1 del teléfono de terreno). */
export interface LoteItem {
  captura_id?: string
  creado_en?: string
  tag: string
  resultados: Record<string, boolean>
  observaciones?: string | null
  foto_evidencia_base64?: string | null
  gps?: { lat: number; lng: number } | null
  dispositivo?: string | null
  /** M2: inspector de terreno del propio ítem (si el export lo lleva por captura). */
  inspector_username?: string | null
}

/** Lote completo exportado por la app de terreno. Los metadatos del manifest son opcionales. */
export interface LoteExport {
  schema: string
  generado_en?: string
  dispositivo?: string
  inspector_username?: string
  app_version?: string
  total?: number
  items: LoteItem[]
}

/** Metadatos por lote que viajan en el campo `meta` de cada POST de importación. */
export interface MetaImport {
  archivo_hash?: string
  dispositivo?: string
}

/** Resultado por ítem tras reenviarlo al servidor. */
export interface ResultadoImport {
  tag: string
  captura_id?: string
  estado: 'creado' | 'duplicado' | 'error'
  http?: number
  msg?: string
}

function esObjeto(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Valida un objeto ya parseado contra el contrato de exportación. Nunca lanza:
 * devuelve ok:false con un mensaje en español listo para mostrar al usuario.
 * Comprueba schema exacto, items como array no vacío, y (por ítem) tag string no vacío
 * y resultados como objeto.
 */
export function validarLoteExport(obj: unknown): { ok: true; lote: LoteExport } | { ok: false; error: string } {
  if (!esObjeto(obj)) return { ok: false, error: 'El archivo no contiene un objeto JSON válido.' }
  if (obj.schema !== 'brigada.export/v1') {
    return { ok: false, error: 'Esquema no reconocido: se esperaba "brigada.export/v1".' }
  }
  if (!Array.isArray(obj.items)) {
    return { ok: false, error: 'El lote no incluye una lista de capturas (items).' }
  }
  if (obj.items.length === 0) {
    return { ok: false, error: 'El lote está vacío: no hay capturas para importar.' }
  }
  for (let i = 0; i < obj.items.length; i++) {
    const it = obj.items[i]
    if (!esObjeto(it)) return { ok: false, error: `La captura #${i + 1} no es un objeto válido.` }
    if (typeof it.tag !== 'string' || it.tag.trim() === '') {
      return { ok: false, error: `La captura #${i + 1} no tiene un tag válido.` }
    }
    if (!esObjeto(it.resultados)) {
      return { ok: false, error: `La captura "${it.tag}" no tiene resultados válidos.` }
    }
  }
  return { ok: true, lote: obj as unknown as LoteExport }
}

/**
 * Construye el cuerpo exacto del POST /inspections/import para un ítem.
 * - Siempre incluye `tag` y `resultados`.
 * - Incluye `captura_id`, `creado_en` y demás opcionales SOLO si están definidos (null sí cuenta).
 * - `dispositivo` del ítem viaja a nivel raíz (lo admite el contrato).
 * - `archivo_hash`/`dispositivo` del lote van anidados en `meta` (solo si están definidos).
 * - M2: `inspector_username` se propaga para preservar la identidad del inspector de campo:
 *   si el ítem lo trae (string no vacío) se usa ese; si no, se cae al del manifest del lote
 *   (`inspectorManifest`). Si no hay ninguno, se omite la clave. Función PURA.
 */
export function construirPayloadImport(
  item: LoteItem,
  meta: MetaImport = {},
  inspectorManifest?: string | null,
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tag: item.tag,
    resultados: item.resultados ?? {},
  }
  if (item.captura_id !== undefined) payload.captura_id = item.captura_id
  if (item.creado_en !== undefined) payload.creado_en = item.creado_en
  if (item.observaciones !== undefined) payload.observaciones = item.observaciones
  if (item.foto_evidencia_base64 !== undefined) payload.foto_evidencia_base64 = item.foto_evidencia_base64
  if (item.gps !== undefined) payload.gps = item.gps
  if (item.dispositivo !== undefined) payload.dispositivo = item.dispositivo

  // M2: fidelidad del inspector de terreno (ítem > manifest), sin inventar valores.
  const delItem = typeof item.inspector_username === 'string' && item.inspector_username.trim() !== ''
    ? item.inspector_username
    : undefined
  const delManifest = typeof inspectorManifest === 'string' && inspectorManifest.trim() !== ''
    ? inspectorManifest
    : undefined
  const inspector = delItem ?? delManifest
  if (inspector !== undefined) payload.inspector_username = inspector

  const metaOut: Record<string, unknown> = {}
  if (meta.archivo_hash !== undefined) metaOut.archivo_hash = meta.archivo_hash
  if (meta.dispositivo !== undefined) metaOut.dispositivo = meta.dispositivo
  if (Object.keys(metaOut).length > 0) payload.meta = metaOut

  return payload
}

/** Cuenta creados / duplicados / errores de una tanda de resultados. */
export function resumirImportacion(res: ResultadoImport[]): {
  total: number
  creados: number
  duplicados: number
  errores: number
} {
  let creados = 0
  let duplicados = 0
  let errores = 0
  for (const r of res) {
    if (r.estado === 'creado') creados++
    else if (r.estado === 'duplicado') duplicados++
    else errores++
  }
  return { total: res.length, creados, duplicados, errores }
}

/** Respaldo no criptográfico (FNV-1a doble) → 16 hex; determinista y estable. */
function hashSimple(texto: string): string {
  let h1 = 2166136261
  let h2 = 2246822519
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i)
    h1 ^= c
    h1 = Math.imul(h1, 16777619)
    h2 ^= c
    h2 = Math.imul(h2, 2654435761)
  }
  const hex = (n: number) => (n >>> 0).toString(16).padStart(8, '0')
  return hex(h1) + hex(h2)
}

/**
 * SHA-256 en hex vía WebCrypto (`crypto.subtle.digest`). Si no está disponible
 * (o falla), cae a un hash simple no criptográfico pero estable. Se usa como
 * `meta.archivo_hash` para trazabilidad del archivo importado.
 */
export async function hashArchivo(texto: string): Promise<string> {
  try {
    const subtle = (globalThis as { crypto?: { subtle?: SubtleCrypto } }).crypto?.subtle
    if (subtle) {
      const datos = new TextEncoder().encode(texto)
      const buf = await subtle.digest('SHA-256', datos)
      return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
    }
  } catch {
    /* sin WebCrypto: se usa el respaldo */
  }
  return hashSimple(texto)
}
