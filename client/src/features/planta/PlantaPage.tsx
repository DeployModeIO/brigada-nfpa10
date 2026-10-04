/**
 * /planta — mapa SVG interactivo de la faena (spec brigada-cliente-local pantalla 9).
 * Pines por estado (verde/ámbar/rojo/negro + gris sin inspeccionar), filtro por área/nave
 * y por estado, click abre la ficha /inspeccion/:tag. Un hallazgo crítico (pin negro)
 * se ve aquí mismo (spec §Reglas 6). Offline: sirve la caché IndexedDB de /extinguishers.
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { cacheAllExtintores, cachePutMany } from '../../lib/offline'
import { OfflineIcon } from '../../components/icons'
import { MapIcon } from '../../components/icons'
import { areasDe, colorDe, filtrarPins, pinsDe } from './pins'
import type { Extinguisher } from '../../lib/types'

interface Resp { items: Extinguisher[]; total: number }

const ESTADOS: Array<{ v: string; t: string }> = [
  { v: '', t: 'Todos los estados' },
  { v: 'vigente', t: 'Vigente' },
  { v: 'por_vencer', t: 'Por vencer' },
  { v: 'vencido', t: 'Vencido' },
  { v: 'rechazado', t: 'Rechazado (NO APTO)' },
  { v: 'sin_inspeccionar', t: 'Sin inspeccionar' },
]

export default function PlantaPage() {
  const navigate = useNavigate()
  const [items, setItems] = useState<Extinguisher[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sinRed, setSinRed] = useState(false)
  const [area, setArea] = useState('')
  const [estado, setEstado] = useState('')
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    let vivo = true
    api
      .get<Resp>('/extinguishers?size=200')
      .then((r) => {
        if (!vivo) return
        setItems(r.items)
        void cachePutMany(r.items).catch(() => undefined)
      })
      .catch(async () => {
        if (!vivo) return
        const cached = await cacheAllExtintores().catch(() => [] as Extinguisher[])
        if (cached.length) { setItems(cached); setSinRed(true) }
        else setError('No se pudo cargar el inventario ni hay caché offline todavía.')
      })
      .finally(() => vivo && setCargando(false))
    return () => { vivo = false }
  }, [])

  const areas = useMemo(() => areasDe(items), [items])
  const visibles = useMemo(() => filtrarPins(items, area, estado), [items, area, estado])
  const pins = useMemo(() => pinsDe(visibles), [visibles])
  const negros = pins.filter((p) => p.estado === 'rechazado').length

  return (
    <section className="flex flex-col gap-3" aria-labelledby="titulo-planta">
      <header className="flex items-center gap-2">
        <MapIcon size={22} className="text-primary" />
        <h1 id="titulo-planta" className="text-lg font-bold text-text">Planta — mapa de extintores</h1>
        <span className="ml-auto text-xs text-text2">{pins.length} equipos</span>
      </header>

      {sinRed && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-warn/50 bg-bg2 p-2 text-xs text-warn">
          <OfflineIcon size={16} /> Sin conexión: mostrando caché local del último sincronizado.
        </p>
      )}
      {error && <p role="alert" className="rounded-lg border border-err/50 p-2 text-sm text-err">{error}</p>}
      {negros > 0 && (
        <p className="rounded-lg border border-err/60 bg-bg2 p-2 text-sm font-semibold text-err" role="alert">
          {negros} equipo(s) NO APTO / REQUIERE REEMPLAZO INMEDIATO (pin negro).
        </p>
      )}

      {/* móvil: filtros + mapa apilados; lg+: split view mapa | panel de filtros 360px */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:gap-4">
      <div className="order-2 w-full shrink-0 flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 lg:order-2 lg:w-[360px]" data-testid="panel-filtros">
        <p className="text-xs font-semibold uppercase tracking-wide text-text2 lg:hidden">Filtros</p>
        <label className="text-xs text-text2 lg:flex lg:flex-col lg:gap-1">
          <span className="sr-only lg:not-sr-only">Filtrar por área o nave</span>
          <select value={area} onChange={(e) => setArea(e.target.value)} className="min-h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm text-text lg:min-h-11" aria-label="Filtrar por área o nave">
            <option value="">Todas las áreas</option>
            {areas.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="text-xs text-text2 lg:flex lg:flex-col lg:gap-1">
          <span className="sr-only lg:not-sr-only">Estado del semáforo</span>
          <select value={estado} onChange={(e) => setEstado(e.target.value)} className="min-h-10 w-full rounded-lg border border-border bg-surface px-2 text-sm text-text lg:min-h-11" aria-label="Filtrar por estado del semáforo">
            {ESTADOS.map((s) => <option key={s.v} value={s.v}>{s.t}</option>)}
          </select>
        </label>
        <p className="text-xs text-text2 lg:mt-1">{pins.length} de {items.length} equipos visibles</p>
        <p className="hidden text-xs text-text2 lg:block">Toca un pin para abrir la ficha de inspección del equipo (funciona offline con la caché).</p>
      </div>

      <div className="order-1 min-w-0 flex-1 lg:order-1">
      {cargando ? (
        <p role="status" className="text-sm text-text2">Cargando planta…</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface">
          <svg viewBox="0 0 100 100" className="h-[62vh] w-full lg:h-[74vh]" role="img" aria-label={`Mapa de planta con ${pins.length} pines de extintores`}>
            {/* retícula de referencia de la nave */}
            <g stroke="var(--border)" strokeWidth="0.2">
              {[10, 30, 50, 70, 90].map((v) => <line key={`h${v}`} x1="4" y1={v} x2="96" y2={v} />)}
              {[10, 30, 50, 70, 90].map((v) => <line key={`v${v}`} x1={v} y1="4" x2={v} y2="96" />)}
            </g>
            {pins.map((p) => (
              <g
                key={p.tag}
                role="link"
                tabIndex={0}
                aria-label={`${p.tag} — ${p.ubicacion} — ${p.estado}`}
                className="cursor-pointer outline-none"
                onClick={() => navigate(`/inspeccion/${encodeURIComponent(p.tag)}`)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); navigate(`/inspeccion/${encodeURIComponent(p.tag)}`) } }}
              >
                <circle cx={p.x} cy={p.y} r={p.r + 0.9} fill="transparent" />
                <circle cx={p.x} cy={p.y} r={p.r} style={{ fill: colorDe(p.estado) }} stroke="var(--surface)" strokeWidth="0.35" />
                {p.estado === 'rechazado' && <text x={p.x} y={p.y + 0.7} textAnchor="middle" fontSize="1.7" fontWeight="700" style={{ fill: 'var(--bg)' }}>!</text>}
              </g>
            ))}
          </svg>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border p-2 text-xs text-text2" aria-label="Leyenda de estados">
            <li className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'var(--ok)' }} /> Vigente</li>
            <li className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'var(--warn)' }} /> Por vencer</li>
            <li className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'var(--err)' }} /> Vencido</li>
            <li className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full border border-border" style={{ background: 'var(--text)' }} /> Rechazado (NO APTO)</li>
            <li className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: 'var(--text2)' }} /> Sin inspeccionar</li>
          </ul>
        </div>
      )}
      <p className="mt-2 text-xs text-text2 lg:hidden">Toca un pin para abrir la ficha de inspección del equipo (funciona offline con la caché).</p>
      </div>
      </div>
    </section>
  )
}
