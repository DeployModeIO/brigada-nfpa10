/**
 * Dashboard (ruta /) — semáforo NFPA 10 desde GET /alerts/panel.
 * 4 tarjetas grandes (Vigente/Por vencer/Vencido/Rechazado) con conteo mono, icono y texto;
 * click filtra → /alertas?color=. Abajo: próximos vencimientos virtualizados + mini-gráfico canvas.
 */
import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { AlertIcon, BookIcon, ChevronRightIcon, DownloadIcon } from '../../components/icons'
import { CATEGORIAS, contDe, type ClaveColor, type PanelItem, type PanelReal } from './semforo'
import { RefreshIcon } from './iconos'
import GraficoSemforo from './GraficoSemforo'
import VencimientosCercanos from './VencimientosCercanos'

export default function DashboardPage() {
  const navigate = useNavigate()
  const [panel, setPanel] = useState<PanelReal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)

  const cargar = useCallback(() => {
    setCargando(true)
    setError(null)
    api
      .get<PanelReal>('/alerts/panel')
      .then(setPanel)
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar el semáforo.'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(cargar, [cargar])

  /* Tiempo real (V2.1 O&G): SSE — el tablero se refresca solo cuando el
     campo registra una inspección o el admin crea/baja un equipo. */
  useEffect(() => {
    let fuente: EventSource | null = null
    let reintentar: ReturnType<typeof setTimeout> | null = null
    const conectar = () => {
      try {
        const token = localStorage.getItem('nfpa_token') ?? ''
        fuente = new EventSource(`/api/v1/events?token=${encodeURIComponent(token)}`)
        const refrescar = () => cargar()
        for (const tipo of ['inspeccion_creada', 'equipo_creado', 'equipo_baja']) {
          fuente.addEventListener(tipo, refrescar)
        }
        fuente.onerror = () => {
          fuente?.close()
          reintentar = setTimeout(conectar, 15_000) // reconexión suave cada 15 s
        }
      } catch { /* SSE no disponible: el botón refrescar sigue funcionando */ }
    }
    conectar()
    return () => {
      fuente?.close()
      if (reintentar) clearTimeout(reintentar)
    }
  }, [cargar])

  const items7d: PanelItem[] = panel
    ? [...panel.verde, ...panel.amarillo, ...panel.rojo]
    : []

  const conteos: Record<ClaveColor, number> = panel
    ? { verde: contDe(panel, 'verde'), amarillo: contDe(panel, 'amarillo'), rojo: contDe(panel, 'rojo'), negro: contDe(panel, 'negro') }
    : { verde: 0, amarillo: 0, rojo: 0, negro: 0 }

  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-inicio">
      <div className="flex items-baseline justify-between gap-2">
        <h1 id="titulo-inicio" className="text-xl font-semibold">
          Semáforo NFPA 10
        </h1>
        <button
          type="button"
          onClick={cargar}
          disabled={cargando}
          aria-label="Actualizar semáforo"
          className="flex min-h-14 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-text2 hover:bg-bg2 disabled:opacity-60"
        >
          <RefreshIcon size={18} /> Actualizar
        </button>
      </div>

      {cargando && !panel && (
        <div role="status" aria-live="polite" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="min-h-32 animate-pulse rounded-xl border border-border bg-surface" />
          ))}
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

      {panel && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4" role="group" aria-label="Tarjetas del semáforo: seleccione una para ver su lista">
            {CATEGORIAS.map((cat) => {
              const n = conteos[cat.clave]
              const Icono = cat.icono
              return (
                <button
                  key={cat.clave}
                  type="button"
                  onClick={() => navigate(`/alertas?color=${cat.clave}`)}
                  aria-label={`${cat.etiqueta}: ${n} extintores. Ver lista de ${cat.etiqueta.toLowerCase()}`}
                  className={`flex min-h-32 flex-col justify-between rounded-xl border bg-surface p-4 text-left hover:bg-bg2 ${cat.claseTarjeta}`}
                >
                  <span className={`flex items-center gap-2 text-sm font-semibold uppercase tracking-wide ${cat.claseTexto}`}>
                    <Icono size={20} />
                    {cat.etiqueta}
                  </span>
                  <span className="font-mono text-5xl font-bold leading-none text-text" data-cont={cat.clave}>
                    {String(n).padStart(2, '0')}
                  </span>
                  <span className="text-xs text-text2">{cat.descripcion}</span>
                </button>
              )
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <VencimientosCercanos items={items7d} />

            <section aria-labelledby="titulo-grafico" className="rounded-xl border border-border bg-surface p-4">
              <h2 id="titulo-grafico" className="mb-2 text-base font-semibold">
                Distribución del semáforo
              </h2>
              <GraficoSemforo conteos={conteos} />
            </section>
          </div>

          <nav aria-label="Accesos rápidos" className="grid gap-2 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => navigate('/alertas?color=rojo')}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 text-left hover:bg-bg2"
            >
              <span className="flex items-center gap-3">
                <AlertIcon size={20} className="shrink-0 text-err" />
                <span>
                  <span className="block font-medium">Atención prioritaria</span>
                  <span className="block text-sm text-text2">Vencidos y rechazados requieren acción</span>
                </span>
              </span>
              <ChevronRightIcon size={20} className="shrink-0 text-text2" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/export')}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 text-left hover:bg-bg2"
            >
              <span className="flex items-center gap-3">
                <DownloadIcon size={20} className="shrink-0 text-info" />
                <span>
                  <span className="block font-medium">Exportar informes</span>
                  <span className="block text-sm text-text2">PDF mensual, XLSX y datos de la base</span>
                </span>
              </span>
              <ChevronRightIcon size={20} className="shrink-0 text-text2" />
            </button>
            <button
              type="button"
              onClick={() => navigate('/escanear')}
              className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 text-left hover:bg-bg2"
            >
              <span className="flex items-center gap-3">
                <BookIcon size={20} className="shrink-0 text-primary" />
                <span>
                  <span className="block font-medium">Registrar inspección</span>
                  <span className="block text-sm text-text2">Escanear QR del extintor en campo</span>
                </span>
              </span>
              <ChevronRightIcon size={20} className="shrink-0 text-text2" />
            </button>
          </nav>
        </>
      )}
    </section>
  )
}
