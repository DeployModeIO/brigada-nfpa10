/**
 * /exportar — Exportación de capturas locales de terreno (MODO_CAPTURA).
 * Lee la cola IndexedDB, empaqueta un lote JSON (schema brigada.export/v1) y lo
 * descarga o comparte para su transferencia MANUAL al PC. NO sube nada al servidor.
 * Con el modo apagado la página sigue funcionando sobre lo que quede en la cola.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { AlertIcon, ClipboardIcon, DownloadIcon, GearIcon, InfoIcon } from '../../components/icons'
import { contarCola, listarCola, type ColaItem } from '../../lib/offline'
import { MODO_CAPTURA } from '../../lib/modo'
import { fechaHora } from '../inspection/apiTypes'
import {
  compartirExport,
  construirExport,
  descargarExport,
  type ExportLote,
} from './exportarLote'

function env(): Record<string, string | undefined> {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {}
}

const APP_VERSION: string = env().VITE_APP_VERSION ?? '0.1.0'
const PREVIEW = 8

export default function ExportarPage() {
  const { usuario } = useAuth()
  const [items, setItems] = useState<ColaItem[]>([])
  const [total, setTotal] = useState(0)
  const [cargando, setCargando] = useState(true)
  const [incluirFotos, setIncluirFotos] = useState(true)
  const [accion, setAccion] = useState<'idle' | 'descargar' | 'compartir'>('idle')
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const [all, n] = await Promise.all([
        listarCola().catch(() => [] as ColaItem[]),
        contarCola().catch(() => 0),
      ])
      setItems(all)
      setTotal(n)
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const dispositivo = useMemo(() => (navigator.userAgent || 'app-brigada').slice(0, 150), [])

  function construir(): ExportLote {
    return construirExport(items, {
      inspectorUsername: usuario?.usuario ?? 'desconocido',
      dispositivo,
      appVersion: APP_VERSION,
      incluirFotos,
    })
  }

  const onDescargar = () => {
    setAccion('descargar')
    setError(null)
    setMensaje(null)
    try {
      descargarExport(construir())
      setMensaje(`Lote descargado (${total} captura(s)).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el lote.')
    } finally {
      setAccion('idle')
    }
  }

  const onCompartir = async () => {
    setAccion('compartir')
    setError(null)
    setMensaje(null)
    try {
      const r = await compartirExport(construir())
      setMensaje(r === 'compartido' ? 'Lote compartido.' : `Lote descargado (${total} captura(s)) — compartir no disponible.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo compartir el lote.')
    } finally {
      setAccion('idle')
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-screen-sm flex-col gap-4 md:max-w-screen-md lg:max-w-4xl" aria-labelledby="titulo-exportar">
      <h1 id="titulo-exportar" className="text-xl font-semibold">
        Exportar capturas de terreno
      </h1>
      <Link
        to="/servidor"
        className="flex min-h-12 w-fit items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-text2 hover:bg-bg2 hover:text-text"
      >
        <GearIcon size={18} /> Configurar servidor del PC
      </Link>

      {!MODO_CAPTURA && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-info bg-info/10 px-3 py-2 text-sm font-medium text-info">
          <InfoIcon size={18} /> Este equipo no está en modo captura local; la cola se sincroniza sola. Aquí puedes exportar lo que quede pendiente.
        </p>
      )}

      {error && (
        <p role="alert" className="flex items-center gap-2 rounded-lg border-2 border-err bg-err/10 px-3 py-2 font-semibold text-err">
          <AlertIcon size={18} /> {error}
        </p>
      )}
      {mensaje && (
        <p role="status" data-testid="export-ok" className="flex items-center gap-2 rounded-lg border-2 border-ok bg-ok/10 px-3 py-2 font-semibold text-ok">
          <DownloadIcon size={18} /> {mensaje}
        </p>
      )}

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-medium">
            Capturas en cola: <span data-testid="export-total" className="font-mono text-primary">{total}</span>
          </p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="flex min-h-12 items-center gap-2 rounded-lg border border-border px-3 text-sm font-medium text-text2 hover:bg-bg2 hover:text-text"
          >
            Refrescar
          </button>
        </div>

        <label className="mt-3 flex min-h-12 items-center gap-3 text-sm font-medium">
          <input
            type="checkbox"
            checked={incluirFotos}
            onChange={(e) => setIncluirFotos(e.target.checked)}
            className="h-5 w-5"
          />
          Incluir fotos de evidencia
        </label>
      </div>

      {cargando ? (
        <p role="status" className="flex items-center gap-2 text-text2">
          <ClipboardIcon size={20} className="animate-pulse" /> Leyendo capturas locales…
        </p>
      ) : total === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-6 text-center" data-testid="export-vacio">
          <ClipboardIcon size={40} className="mx-auto text-text2" />
          <p className="mt-2 font-medium">No hay capturas pendientes de exportar.</p>
          <p className="text-sm text-text2">Las inspecciones guardadas en este dispositivo aparecerán aquí.</p>
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2" data-testid="export-preview">
            {items.slice(0, PREVIEW).map((c, i) => {
              const r = c.payload.resultados || {}
              const fallas = Object.values(r).filter((v) => v === false).length
              return (
                <li
                  key={c.id ?? i}
                  className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-primary">{c.payload.tag}</span>
                    <span className="text-sm text-text2">{fechaHora(c.payload.creado_en ?? new Date(c.creado_en).toISOString())}</span>
                    {c.payload.foto_evidencia_base64 && (
                      <span className="rounded bg-info/15 px-2 py-0.5 text-xs font-semibold text-info">foto</span>
                    )}
                  </span>
                  <span
                    className={`rounded-full border-2 px-3 py-1 text-xs font-bold uppercase ${
                      fallas > 0 ? 'border-err text-err bg-err/10' : 'border-ok text-ok bg-ok/10'
                    }`}
                  >
                    {fallas > 0 ? `Falla (${fallas})` : 'Pasa'}
                  </span>
                </li>
              )
            })}
          </ul>
          {total > PREVIEW && <p className="text-sm text-text2">… y {total - PREVIEW} captura(s) más.</p>}

          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              data-testid="export-descargar"
              onClick={onDescargar}
              disabled={accion !== 'idle'}
              className="flex min-h-16 flex-1 items-center justify-center gap-2 rounded-xl bg-primary text-lg font-bold text-on-primary disabled:opacity-60"
            >
              <DownloadIcon size={24} />
              {accion === 'descargar' ? 'Generando…' : 'DESCARGAR'}
            </button>
            <button
              type="button"
              data-testid="export-compartir"
              onClick={() => void onCompartir()}
              disabled={accion !== 'idle'}
              className="flex min-h-16 flex-1 items-center justify-center gap-2 rounded-xl border-2 border-primary font-bold text-primary disabled:opacity-60"
            >
              <ClipboardIcon size={24} />
              {accion === 'compartir' ? 'Abriendo…' : 'COMPARTIR'}
            </button>
          </div>
        </>
      )}
    </section>
  )
}