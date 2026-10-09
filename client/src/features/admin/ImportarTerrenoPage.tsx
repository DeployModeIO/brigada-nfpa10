/**
 * /importar-terreno (solo admin) — Importación de capturas de terreno al PC.
 * Flujo: el admin elige el JSON exportado por el teléfono (schema brigada.export/v1),
 * se valida, se muestra un resumen pre-importación y, al confirmar, cada ítem se reenvía
 * SECUENCIALMENTE a POST /inspections/import con progreso X/N. Al final se muestra un
 * informe (creado / duplicado / error). Los errores por ítem NO abortan el lote.
 */
import { useRef, useState, type ChangeEvent } from 'react'
import { useAuth } from '../../context/AuthContext'
import { api, ApiError } from '../../lib/api'
import { AlertIcon, CheckIcon, ClipboardIcon, DownloadIcon } from '../../components/icons'
import { Aviso } from './UI'
import {
  construirPayloadImport,
  hashArchivo,
  puedeImportarSegunRol,
  resumirImportacion,
  validarLoteExport,
  type LoteExport,
  type ResultadoImport,
} from './importarTerreno'

/** Respuesta del endpoint de importación (201 normal, 200 duplicado). */
interface RespuestaImport {
  id?: number
  tag?: string
  fecha?: string
  proximo_vencimiento?: string
  criticas?: unknown
  rechazado?: unknown
  duplicado?: boolean
  captura_id?: string
}

// L1: límites de cordura del archivo de terreno antes de procesarlo (evita colgar la pestaña).
const MAX_ARCHIVO_MB = 50
const MAX_ARCHIVO_BYTES = MAX_ARCHIVO_MB * 1024 * 1024
const MAX_ITEMS_LOTE = 5000

const ESTADO_UI: Record<ResultadoImport['estado'], { texto: string; clase: string }> = {
  creado: { texto: 'Creado', clase: 'border-ok text-ok bg-ok/10' },
  duplicado: { texto: 'Duplicado', clase: 'border-info text-info bg-info/10' },
  error: { texto: 'Error', clase: 'border-err text-err bg-err/10' },
}

function mensajeDe(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.detail as { msg?: string; message?: string } | null
    return d?.msg ?? d?.message ?? e.message
  }
  return e instanceof Error ? e.message : 'Error inesperado.'
}

export default function ImportarTerrenoPage() {
  const { usuario } = useAuth()
  // L5 (defensa en profundidad): gate ESTRICTO por el rol refrescado desde el servidor
  // (AuthContext refresca usuario con GET /auth/me al montar). Offline, el rol decodificado
  // del token es lo mejor disponible — aceptable: el servidor sigue forzando 403.
  const esAdmin = puedeImportarSegunRol(usuario?.rol)

  const inputRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<string | null>(null)
  const [rawText, setRawText] = useState('')
  const [lote, setLote] = useState<LoteExport | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [noAutorizado, setNoAutorizado] = useState<string | null>(null)
  const [fase, setFase] = useState<'idle' | 'importando' | 'listo'>('idle')
  const [progreso, setProgreso] = useState({ hecho: 0, total: 0 })
  const [resultados, setResultados] = useState<ResultadoImport[]>([])

  function reiniciar() {
    setArchivo(null)
    setRawText('')
    setLote(null)
    setError(null)
    setNoAutorizado(null)
    setFase('idle')
    setProgreso({ hecho: 0, total: 0 })
    setResultados([])
    if (inputRef.current) inputRef.current.value = ''
  }

  async function onElegirArchivo(ev: ChangeEvent<HTMLInputElement>) {
    // B1: capturar el File ANTES de reiniciar() — reiniciar() vacía input.value y con ello el
    // FileList vivo del evento; leerlo después daba siempre undefined (importación no-op silenciosa).
    const f = ev.target.files?.[0]
    reiniciar()
    if (!f) return
    setArchivo(f.name)
    // L1: rechazar ANTES de parsear si el archivo es absurdamente grande.
    if (f.size > MAX_ARCHIVO_BYTES) {
      setError(`El archivo supera el máximo permitido de ${MAX_ARCHIVO_MB} MB. Divídalo en lotes más pequeños.`)
      return
    }
    let texto: string
    try {
      texto = await f.text()
    } catch {
      setError('No se pudo leer el archivo seleccionado.')
      return
    }
    let obj: unknown
    try {
      obj = JSON.parse(texto)
    } catch {
      setError('El archivo no es un JSON válido.')
      return
    }
    const v = validarLoteExport(obj)
    if (!v.ok) {
      setError(v.error)
      return
    }
    // L1: rechazar lotes con demasiadas capturas (el reenvío es secuencial).
    if (v.lote.items.length > MAX_ITEMS_LOTE) {
      setError(`El lote tiene ${v.lote.items.length} capturas y supera el máximo de ${MAX_ITEMS_LOTE}. Divídalo en lotes más pequeños.`)
      return
    }
    setRawText(texto)
    setLote(v.lote)
  }

  async function importar() {
    if (!lote || fase === 'importando') return
    setError(null)
    setNoAutorizado(null)
    setFase('importando')
    setResultados([])
    const total = lote.items.length
    setProgreso({ hecho: 0, total })

    // meta por lote: hash del archivo + dispositivo declarado en el export.
    const hash = await hashArchivo(rawText)
    const meta = { archivo_hash: hash, dispositivo: lote.dispositivo }

    const acumulado: ResultadoImport[] = []
    for (let i = 0; i < total; i++) {
      const item = lote.items[i]
      try {
        const r = await api.post<RespuestaImport>('/inspections/import', construirPayloadImport(item, meta, lote.inspector_username))
        if (r && r.duplicado === true) {
          acumulado.push({ tag: item.tag, captura_id: r.captura_id ?? item.captura_id, estado: 'duplicado', http: 200 })
        } else {
          acumulado.push({ tag: r?.tag ?? item.tag, captura_id: item.captura_id, estado: 'creado', http: 201 })
        }
      } catch (e) {
        const http = e instanceof ApiError ? e.status : undefined
        acumulado.push({ tag: item.tag, captura_id: item.captura_id, estado: 'error', http, msg: mensajeDe(e) })
        setResultados([...acumulado])
        setProgreso({ hecho: i + 1, total })
        // 403 (no admin) y 0 (sin conexión) son fallos de tanda: abortar con aviso claro.
        if (http === 403) {
          setNoAutorizado('La importación requiere rol admin. El servidor rechazó la operación (403).')
          setFase('listo')
          return
        }
        if (http === 0) {
          setError('Sin conexión con el servidor: se canceló el resto del lote.')
          setFase('listo')
          return
        }
        continue
      }
      setResultados([...acumulado])
      setProgreso({ hecho: i + 1, total })
    }
    setFase('listo')
  }

  const resumen = resumirImportacion(resultados)
  const pct = progreso.total > 0 ? Math.round((progreso.hecho / progreso.total) * 100) : 0

  return (
    <section className="mx-auto flex w-full max-w-screen-sm flex-col gap-4 md:max-w-screen-md lg:max-w-4xl" aria-labelledby="titulo-importar">
      <h1 id="titulo-importar" className="flex items-center gap-2 text-xl font-semibold">
        <DownloadIcon size={22} className="rotate-180" /> Importar capturas de terreno
      </h1>

      <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text2">
        Seleccione el archivo JSON exportado por el teléfono de terreno (esquema{' '}
        <span className="font-mono">brigada.export/v1</span>). Cada captura se reenvía al servidor de forma
        secuencial; las ya importadas se registran como duplicadas y no se repiten.
      </p>

      {!esAdmin && (
        <div className="rounded-xl border-2 border-err bg-err/10 p-4 text-sm font-semibold text-err" role="alert">
          <p className="flex items-center gap-2">
            <AlertIcon size={18} /> Solo administrador: la importación de terreno requiere el rol admin.
          </p>
          <p className="mt-1 font-normal">Rol actual: <span className="font-mono">{usuario?.rol ?? 'desconocido'}</span>. Inicie sesión con una cuenta admin; el servidor rechaza la operación (403).</p>
        </div>
      )}

      {noAutorizado && <Aviso tipo="err">{noAutorizado}</Aviso>}
      {error && <Aviso tipo="err">{error}</Aviso>}

      {esAdmin && (
        <div className="rounded-xl border border-border bg-surface p-4">
          <label htmlFor="import-file" className="block text-sm font-medium">
            Archivo del teléfono (.json)
          </label>
          <input
            ref={inputRef}
            id="import-file"
            type="file"
            accept="application/json,.json"
            onChange={(e) => void onElegirArchivo(e)}
            disabled={fase === 'importando'}
            className="mt-2 block w-full min-h-14 rounded-lg border border-border bg-bg2 px-3 py-2 text-sm text-text file:mr-3 file:min-h-10 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:text-sm file:font-semibold file:text-on-primary"
          />
        </div>
      )}

      {lote && fase !== 'listo' && (
        <div className="rounded-xl border border-border bg-surface p-4" aria-label="Resumen antes de importar">
          <p className="text-sm font-semibold">Resumen del lote</p>
          <dl className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-2 border-b border-border/50 py-1">
              <dt className="text-text2">Archivo</dt>
              <dd className="truncate font-mono">{archivo ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/50 py-1">
              <dt className="text-text2">Capturas</dt>
              <dd className="font-mono font-semibold text-primary">{lote.items.length}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/50 py-1">
              <dt className="text-text2">Dispositivo</dt>
              <dd className="truncate font-mono">{lote.dispositivo ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/50 py-1">
              <dt className="text-text2">Inspector</dt>
              <dd className="truncate font-mono">{lote.inspector_username ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/50 py-1">
              <dt className="text-text2">Generado</dt>
              <dd className="truncate font-mono">{lote.generado_en ?? '—'}</dd>
            </div>
            <div className="flex justify-between gap-2 border-b border-border/50 py-1">
              <dt className="text-text2">App</dt>
              <dd className="truncate font-mono">{lote.app_version ?? '—'}</dd>
            </div>
          </dl>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => void importar()}
              disabled={fase === 'importando'}
              aria-busy={fase === 'importando'}
              className="flex min-h-16 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-lg font-bold text-on-primary disabled:opacity-60"
            >
              <CheckIcon size={22} />
              {fase === 'importando' ? 'Importando…' : `CONFIRMAR E IMPORTAR (${lote.items.length})`}
            </button>
            <button
              type="button"
              onClick={reiniciar}
              disabled={fase === 'importando'}
              className="flex min-h-16 items-center justify-center rounded-xl border-2 border-border px-4 text-sm font-semibold text-text2 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {fase === 'importando' && (
        <div className="rounded-xl border border-border bg-surface p-4" role="status" aria-live="polite">
          <p className="text-sm font-medium">
            Importando… <span className="font-mono">{progreso.hecho}/{progreso.total}</span>
          </p>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-bg2" aria-hidden="true">
            <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {fase === 'listo' && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Resumen de la importación">
            <div className="rounded-xl border border-border bg-surface p-3 text-center">
              <p className="text-2xl font-bold font-mono text-text">{resumen.total}</p>
              <p className="text-xs text-text2">Total</p>
            </div>
            <div className="rounded-xl border border-ok bg-ok/10 p-3 text-center">
              <p className="text-2xl font-bold font-mono text-ok">{resumen.creados}</p>
              <p className="text-xs text-text2">Creados</p>
            </div>
            <div className="rounded-xl border border-info bg-info/10 p-3 text-center">
              <p className="text-2xl font-bold font-mono text-info">{resumen.duplicados}</p>
              <p className="text-xs text-text2">Duplicados</p>
            </div>
            <div className="rounded-xl border border-err bg-err/10 p-3 text-center">
              <p className="text-2xl font-bold font-mono text-err">{resumen.errores}</p>
              <p className="text-xs text-text2">Errores</p>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
              <ClipboardIcon size={18} /> Informe por captura
            </p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-sm" aria-label="Resultado de la importación por captura">
                <thead>
                  <tr className="border-b border-border text-left text-text2">
                    <th scope="col" className="py-2 pr-2">Tag</th>
                    <th scope="col" className="py-2 pr-2">Estado</th>
                    <th scope="col" className="py-2 pr-2">HTTP</th>
                    <th scope="col" className="py-2 pr-2">Mensaje</th>
                  </tr>
                </thead>
                <tbody>
                  {resultados.map((r, i) => {
                    const ui = ESTADO_UI[r.estado]
                    return (
                      <tr key={`${r.tag}-${i}`} className="border-b border-border/50">
                        <td className="py-2 pr-2 font-mono font-semibold">{r.tag}</td>
                        <td className="py-2 pr-2">
                          <span className={`rounded-full border px-2 py-1 text-xs font-semibold ${ui.clase}`}>{ui.texto}</span>
                        </td>
                        <td className="py-2 pr-2 font-mono">{r.http ?? '—'}</td>
                        <td className="py-2 pr-2">{r.msg ?? '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <button
            type="button"
            onClick={reiniciar}
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl border-2 border-primary px-4 text-sm font-semibold text-primary"
          >
            <DownloadIcon size={18} className="rotate-180" /> Importar otro archivo
          </button>
        </>
      )}
    </section>
  )
}
