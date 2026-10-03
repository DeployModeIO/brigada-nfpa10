/**
 * /buscar y /inspecciones (agente C) — lista virtualizada de extintores con búsqueda
 * server-side (GET /extinguishers?q=), caché IndexedDB para uso offline y navegación a
 * /inspeccion/:tag.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { api } from '../../lib/api'
import { cacheAllExtintores, cachePutMany } from '../../lib/offline'
import { SearchIcon } from '../../components/icons'
import StatusBadge from '../inspection/StatusBadge'
import type { ExtDto, Pag } from '../inspection/apiTypes'

const TAMANO_PAG = 200

export default function ExtinguisherListPage() {
  const [params, setParams] = useSearchParams()
  const q = params.get('q') ?? ''
  const [todos, setTodos] = useState<ExtDto[]>([])
  const [total, setTotal] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [desdeCache, setDesdeCache] = useState(false)
  const [cargando, setCargando] = useState(true)

  const texto = useMemo(() => q.trim().toLowerCase(), [q])

  useEffect(() => {
    let vivo = true
    let t: number | undefined
    const cargar = async (needle: string) => {
      setCargando(true)
      try {
        const r = await api.get<Pag<ExtDto>>(
          `/extinguishers?size=${TAMANO_PAG}${needle ? `&q=${encodeURIComponent(needle)}` : ''}`,
        )
        if (!vivo) return
        setTodos(r.items)
        setTotal(r.total)
        setError(null)
        setDesdeCache(false)
        if (!needle) void cachePutMany(r.items as unknown as import('../../lib/types').Extinguisher[]).catch(() => undefined)
      } catch (e) {
        if (!vivo) return
        const cached = (await cacheAllExtintores().catch(() => [])) as unknown as ExtDto[]
        const filtrados = needle
          ? cached.filter(
              (x) =>
                x.tag.toLowerCase().includes(needle) ||
                (x.ubicacion || '').toLowerCase().includes(needle) ||
                (x.tipo || '').toLowerCase().includes(needle),
            )
          : cached
        setTodos(filtrados)
        setTotal(filtrados.length)
        setDesdeCache(filtrados.length > 0)
        setError(
          filtrados.length > 0
            ? 'Sin conexión: mostrando caché local.'
            : e instanceof Error
              ? `${e.message} — sin caché disponible.`
              : 'Error de carga sin caché disponible.',
        )
      } finally {
        if (vivo) setCargando(false)
      }
    }
    t = window.setTimeout(() => void cargar(texto), 250)
    return () => {
      vivo = false
      if (t) window.clearTimeout(t)
    }
  }, [texto])

  const padreRef = useRef<HTMLDivElement | null>(null)
  const virtualizador = useVirtualizer({
    count: todos.length,
    getScrollElement: () => padreRef.current,
    estimateSize: () => 78,
    overscan: 6,
  })

  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-lista">
      <h1 id="titulo-lista" className="text-xl font-semibold">
        Extintores
      </h1>

      <div className="relative">
        <SearchIcon size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text2" />
        <input
          type="search"
          data-testid="buscar-extintores"
          aria-label="Buscar por tag, ubicación o tipo"
          placeholder="Buscar por tag…"
          value={q}
          onChange={(e) => setParams(e.target.value ? { q: e.target.value } : {}, { replace: true })}
          className="min-h-14 w-full rounded-lg border border-border bg-surface pl-10 pr-3 text-base"
        />
      </div>

      <div role="status" aria-live="polite" className="flex min-h-6 items-center gap-2 text-sm text-text2">
        {cargando && 'Buscando…'}
        {!cargando && (
          <>
            {total} resultado(s){texto ? ` para «${q.trim()}»` : ''}
            {desdeCache && <span className="font-semibold text-warn">· caché local</span>}
          </>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-warn bg-warn/10 px-3 py-2 text-sm text-warn">
          {error}
        </p>
      )}

      {!cargando && todos.length === 0 && !error && (
        <p className="rounded-xl border border-dashed border-border bg-surface p-6 text-center text-text2">
          Sin coincidencias{texto ? ` para «${q.trim()}»` : ''}. Revisa el tag o busca por ubicación.
        </p>
      )}

      <div ref={padreRef} className="max-h-[62dvh] overflow-auto" aria-label="Lista de extintores">
        <ul
          className="relative"
          style={{ height: `${virtualizador.getTotalSize()}px` }}
        >
          {virtualizador.getVirtualItems().map((fila) => {
            const x = todos[fila.index]
            return (
              <li
                key={x.tag}
                data-testid={`fila-${x.tag}`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: `${fila.size}px`,
                  transform: `translateY(${fila.start}px)`,
                }}
                className="py-1"
              >
                <Link
                  to={`/inspeccion/${encodeURIComponent(x.tag)}`}
                  className="flex min-h-14 h-full items-center justify-between gap-3 rounded-xl border border-border bg-surface px-4 hover:bg-bg2"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-mono font-medium">{x.tag}</span>
                    <span className="block truncate text-sm text-text2">
                      {x.ubicacion} · {x.tipo}
                    </span>
                  </span>
                  <StatusBadge estado={x.estadoCalculado} />
                </Link>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
