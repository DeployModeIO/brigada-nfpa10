/**
 * Lista virtualizada de próximos vencimientos (≤7 días) con @tanstack/react-virtual.
 * Accesible: role="list" + aria-label; filas con tag mono, ubicación, fecha y días restantes.
 */
import { useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVirtualizer } from '@tanstack/react-virtual'
import { diasHasta, fechaCorta, venceEn7Dias, type PanelItem } from './semforo'
import { ChevronRightIcon } from '../../components/icons'

interface Props {
  items: PanelItem[]
}

export default function VencimientosCercanos({ items }: Props) {
  const parentRef = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  const cercanos = useMemo(
    () =>
      items
        .filter((it) => venceEn7Dias(it.proximo_vencimiento))
        .sort((a, b) => (a.proximo_vencimiento ?? '').localeCompare(b.proximo_vencimiento ?? '')),
    [items],
  )

  const virtualizer = useVirtualizer({
    count: cercanos.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64,
    overscan: 6,
  })

  return (
    <section
      aria-labelledby="titulo-vencimientos"
      className="rounded-xl border border-border bg-surface p-4"
    >
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <h2 id="titulo-vencimientos" className="text-base font-semibold text-text">
          Próximos vencimientos (7 días)
        </h2>
        <span className="font-mono text-sm text-text2" aria-hidden="true">
          {cercanos.length}
        </span>
      </div>
      {cercanos.length === 0 ? (
        <p className="py-6 text-center text-sm text-text2" role="status">
          Sin vencimientos en los próximos 7 días.
        </p>
      ) : (
        <>
          <p className="sr-only" role="status">
            {cercanos.length} extintores vencen en 7 días o menos.
          </p>
          <div ref={parentRef} className="max-h-80 overflow-y-auto">
            <ul role="list" className="relative m-0 list-none p-0" style={{ height: virtualizer.getTotalSize() }}>
              {virtualizer.getVirtualItems().map((fila) => {
                const it = cercanos[fila.index]
                const dias = diasHasta(it.proximo_vencimiento)
                const textoDias =
                  dias === null ? '—' : dias < 0 ? `venció hace ${Math.abs(dias)} d` : dias === 0 ? 'vence hoy' : `en ${dias} d`
                return (
                  <li
                    key={it.tag}
                    role="listitem"
                    className="absolute left-0 top-0 w-full"
                    style={{ height: fila.size, transform: `translateY(${fila.start}px)` }}
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/inspeccion/${encodeURIComponent(it.tag)}`)}
                      aria-label={`Vencimiento de ${it.tag}, ${it.ubicacion}, ${textoDias}. Inspeccionar`}
                      className="flex min-h-14 w-full items-center justify-between gap-3 border-b border-border px-1 text-left hover:bg-bg2"
                    >
                      <span className="min-w-0">
                        <span className="block truncate font-mono text-sm font-semibold text-text">{it.tag}</span>
                        <span className="block truncate text-xs text-text2">
                          {it.ubicacion} · {it.tipo || 'sin tipo'}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-2 text-right">
                        <span className="text-xs">
                          <span className="block font-mono text-text2">{fechaCorta(it.proximo_vencimiento)}</span>
                          <span className={`block font-medium ${dias !== null && dias < 0 ? 'text-err' : 'text-warn'}`}>
                            {textoDias}
                          </span>
                        </span>
                        <ChevronRightIcon size={18} className="shrink-0 text-text2" />
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </>
      )}
    </section>
  )
}
