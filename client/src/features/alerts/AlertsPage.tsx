/**
 * Alertas (ruta /alertas) — lista por categoría del semáforo.
 * Lee ?color= (verde|amarillo|rojo|negro, por defecto rojo), banner con contador,
 * botón "Inspeccionar" por extintor → /inspeccion/:tag y descarga de la
 * LISTA DE REEMPLAZO (GET /alerts/replacement-list.csv autenticado).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { API_BASE, api, getToken } from '../../lib/api'
import { AlertIcon, CheckIcon, ClipboardIcon, DownloadIcon } from '../../components/icons'
import {
  CATEGORIAS,
  categoriaDe,
  contDe,
  cssVar,
  diasHasta,
  esClaveColor,
  fechaCorta,
  type ClaveColor,
  type PanelReal,
} from '../dashboard/semforo'

export default function AlertsPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const colorParam = searchParams.get('color')
  const color: ClaveColor = esClaveColor(colorParam) ? colorParam : 'rojo'

  const [panel, setPanel] = useState<PanelReal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [csv, setCsv] = useState<'idle' | 'descargando'>('idle')
  const [csvError, setCsvError] = useState<string | null>(null)

  const cargar = useCallback(() => {
    setCargando(true)
    setError(null)
    api
      .get<PanelReal>('/alerts/panel')
      .then(setPanel)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar el panel de alertas.'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(cargar, [cargar])

  const items = useMemo(() => (panel ? panel[color] ?? [] : []), [panel, color])
  const cont = panel ? contDe(panel, color) : 0
  const categoria = categoriaDe(color)

  function seleccionar(c: ClaveColor) {
    setSearchParams({ color: c })
  }

  async function descargarCsv() {
    const token = getToken()
    if (!token) {
      setCsvError('Sesión no válida; inicie sesión para descargar.')
      return
    }
    setCsv('descargando')
    setCsvError(null)
    try {
      const res = await fetch(`${API_BASE}/alerts/replacement-list.csv`, {
        headers: { Authorization: `Bearer ${token}` },
      })
      if (!res.ok) throw new Error(`Error HTTP ${res.status}`)
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'lista-reemplazo-extintores.csv'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 4000)
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : 'No se pudo descargar la lista.')
    } finally {
      setCsv('idle')
    }
  }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-alertas">
      <h1 id="titulo-alertas" className="flex items-center gap-2 text-xl font-semibold">
        <AlertIcon size={22} /> Alertas
      </h1>

      <div
        role="group"
        aria-label="Filtrar por categoría del semáforo"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4"
      >
        {CATEGORIAS.map((cat) => {
          const activo = cat.clave === color
          const n = panel ? contDe(panel, cat.clave) : 0
          return (
            <button
              key={cat.clave}
              type="button"
              onClick={() => seleccionar(cat.clave)}
              aria-pressed={activo}
              className={`flex min-h-14 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-semibold ${
                activo
                  ? 'border-primary bg-primary text-on-primary'
                  : `border-border bg-surface ${cat.claseTexto} hover:bg-bg2`
              }`}
            >
              <span
                className={`h-3 w-3 rounded-full ${activo ? 'bg-on-primary' : cat.clasePunto}`}
                aria-hidden="true"
              />
              {cat.etiqueta}
              <span className="font-mono">{panel ? n : '—'}</span>
            </button>
          )
        })}
      </div>

      {cargando && !panel && (
        <div role="status" className="flex flex-col gap-2" aria-live="polite">
          {[0, 1, 2].map((i) => (
            <div key={i} className="min-h-14 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
          <span className="sr-only">Cargando alertas…</span>
        </div>
      )}

      {error && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-err bg-err/10 p-4 text-sm text-err">
          <AlertIcon size={20} className="mt-0.5 shrink-0" />
          <span>
            {error}
            <button type="button" onClick={cargar} className="ml-2 min-h-10 rounded-md border border-err px-3 font-medium">
              Reintentar
            </button>
          </span>
        </div>
      )}

      {panel && !error && (
        <>
          <p
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 rounded-xl border border-border bg-surface px-4 py-3 text-sm"
          >
            <span
              className="inline-block h-3 w-3 shrink-0 rounded-full"
              style={{ backgroundColor: cssVar(color === 'negro' ? 'text' : (color === 'verde' ? 'ok' : color === 'amarillo' ? 'warn' : 'err')) }}
              aria-hidden="true"
            />
            <strong className="font-mono text-base">{cont}</strong>
            {' '}
            <span className="text-text2">
              {cont === 1 ? 'extintor en' : 'extintores en'} la categoría <strong className="text-text">{categoria.etiqueta}</strong>
              {' — '}
              {categoria.descripcion.toLowerCase()}.
            </span>
          </p>

          <button
            type="button"
            onClick={() => void descargarCsv()}
            disabled={csv === 'descargando'}
            aria-busy={csv === 'descargando'}
            className="flex min-h-14 items-center justify-center gap-2 rounded-xl border border-err bg-surface px-4 text-sm font-bold uppercase tracking-wide text-err hover:bg-bg2 disabled:opacity-60"
          >
            <DownloadIcon size={20} />
            {csv === 'descargando' ? 'Descargando…' : 'Lista de reemplazo'}
          </button>
          {csvError && (
            <p role="alert" className="text-sm text-err">
              {csvError}
            </p>
          )}

          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border bg-surface p-8 text-center text-text2" role="status">
              <CheckIcon size={24} className="text-ok" />
              Sin extintores en esta categoría.
            </div>
          ) : (
            <>
            {/* Escritorio (lg+): tabla con cabecera fija */}
            <div data-testid="tabla-alertas" className="hidden max-h-[64dvh] overflow-auto rounded-xl border border-border bg-surface lg:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="sticky top-0 z-10 border-b border-border bg-surface text-left text-text2">
                    <th scope="col" className="px-4 py-2 font-medium">Tag</th>
                    <th scope="col" className="px-3 py-2 font-medium">Ubicación</th>
                    <th scope="col" className="px-3 py-2 font-medium">Tipo</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Cap. (L)</th>
                    <th scope="col" className="px-3 py-2 font-medium">Próximo vencimiento</th>
                    <th scope="col" className="px-3 py-2 text-right font-medium">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((it) => {
                    const dias = diasHasta(it.proximo_vencimiento)
                    return (
                      <tr key={it.tag} className={`border-b border-border/50 last:border-b-0 ${color === 'negro' ? 'bg-bg2' : ''}`}>
                        <th scope="row" className="px-4 py-2 text-left font-mono font-semibold text-text">{it.tag}</th>
                        <td className="max-w-[260px] truncate px-3 py-2">{it.ubicacion}</td>
                        <td className="px-3 py-2">{it.tipo || '—'}</td>
                        <td className="px-3 py-2 text-right font-mono">{it.capacidad_l ?? '—'}</td>
                        <td className="px-3 py-2 font-mono">
                          {fechaCorta(it.proximo_vencimiento)}
                          {dias !== null && (
                            <span className={`ml-2 font-medium ${dias < 0 ? 'text-err' : 'text-warn'}`}>
                              {dias < 0 ? `atrasado ${Math.abs(dias)} d` : dias === 0 ? 'hoy' : `en ${dias} d`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <button
                            type="button"
                            onClick={() => navigate(`/inspeccion/${encodeURIComponent(it.tag)}`)}
                            aria-label={`Inspeccionar extintor ${it.tag} en ${it.ubicacion}`}
                            className="flex min-h-10 items-center gap-2 rounded-lg border border-primary bg-primary px-3 text-xs font-semibold text-on-primary"
                          >
                            <ClipboardIcon size={16} /> Inspeccionar
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Móvil/tablet: tarjetas */}
            <ul role="list" aria-label={`Extintores ${categoria.etiqueta}`} className="flex flex-col gap-2 lg:hidden">
              {items.map((it) => {
                const dias = diasHasta(it.proximo_vencimiento)
                return (
                  <li
                    key={it.tag}
                    role="listitem"
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-surface p-4 ${
                      color === 'negro' ? 'border-err bg-bg2' : 'border-border'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-base font-bold text-text">{it.tag}</p>
                      <p className="truncate text-sm text-text2">
                        {it.ubicacion}
                        {it.tipo ? ` · ${it.tipo}${it.capacidad_l ? ` ${it.capacidad_l} L` : ''}` : ''}
                      </p>
                      <p className="text-sm">
                        <span className="text-text2">Vence: </span>
                        <span className="font-mono text-text">{fechaCorta(it.proximo_vencimiento)}</span>
                        {dias !== null && (
                          <span className={`ml-2 font-medium ${dias < 0 ? 'text-err' : 'text-warn'}`}>
                            {dias < 0 ? `atrasado ${Math.abs(dias)} d` : dias === 0 ? 'hoy' : `en ${dias} d`}
                          </span>
                        )}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/inspeccion/${encodeURIComponent(it.tag)}`)}
                      aria-label={`Inspeccionar extintor ${it.tag} en ${it.ubicacion}`}
                      className="flex min-h-14 shrink-0 items-center gap-2 rounded-lg border border-primary bg-primary px-4 text-sm font-semibold text-on-primary"
                    >
                      <ClipboardIcon size={18} /> Inspeccionar
                    </button>
                  </li>
                )
              })}
            </ul>
            </>
          )}
        </>
      )}
    </section>
  )
}
