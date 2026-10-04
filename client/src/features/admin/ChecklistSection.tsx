/**
 * Checklist configurable: GET/POST/PATCH/DELETE /checklist-items (admin escribe).
 * Alta (clave, etiqueta, orden), edición inline, activar/desactivar, baja con confirmación.
 * Limitación del backend real: GET solo devuelve items activo=1, así que un ítem
 * desactivado desaparece de la lista al recargar (reactivable solo en esta sesión o
 * por API con su id). Se documenta en la UI.
 */
import { useCallback, useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { CheckIcon, ClipboardIcon, CloseIcon } from '../../components/icons'
import { Aviso, BotonConfirmar, CampoError, inputCls } from './UI'

interface ChecklistReal {
  id: number
  clave: string
  etiqueta: string
  orden: number
  activo: number | boolean
}

const esActivo = (r: ChecklistReal | ChecklistItemNuevo) => r.activo === 1 || r.activo === true

interface ChecklistItemNuevo {
  id: number
  clave: string
  etiqueta: string
  orden: number
  activo: number | boolean
}

export default function ChecklistSection({ esAdmin, soloLectura }: { esAdmin: boolean; soloLectura: boolean }) {
  const [items, setItems] = useState<ChecklistReal[]>([])
  const [inactivos, setInactivos] = useState<ChecklistItemNuevo[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [alta, setAlta] = useState({ clave: '', etiqueta: '', orden: '' })
  const [erroresAlta, setErroresAlta] = useState<Record<string, string>>({})
  const [editando, setEditando] = useState<number | null>(null)
  const [formEdit, setFormEdit] = useState({ clave: '', etiqueta: '', orden: 0 })

  const cargar = useCallback(() => {
    setCargando(true)
    api
      .get<ChecklistReal[]>('/checklist-items')
      .then((r) => setItems([...r].sort((a, b) => a.orden - b.orden || a.id - b.id)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar el checklist.'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(cargar, [cargar])

  function mensajeError(e: unknown): string {
    if (e instanceof ApiError) {
      const detail = e.detail as { msg?: string } | null
      return detail?.msg ?? e.message
    }
    return e instanceof Error ? e.message : 'Error inesperado.'
  }

  async function crear() {
    const errs: Record<string, string> = {}
    const clave = alta.clave.trim().toLowerCase()
    if (!/^[a-z][a-z0-9_]{1,31}$/.test(clave)) errs.clave = 'Clave: 2-32 caracteres, inicia con letra, solo a-z 0-9 _'
    if (!alta.etiqueta.trim()) errs.etiqueta = 'La etiqueta es obligatoria.'
    const orden = alta.orden === '' ? items.length + 1 : Number(alta.orden)
    if (!Number.isFinite(orden) || orden < 0) errs.orden = 'Orden inválido.'
    setErroresAlta(errs)
    if (Object.keys(errs).length) return
    setOk(null)
    try {
      const creado = await api.post<ChecklistReal>('/checklist-items', { clave, etiqueta: alta.etiqueta.trim(), orden, activo: true })
      setItems((prev) => [...prev, creado].sort((a, b) => a.orden - b.orden || a.id - b.id))
      setAlta({ clave: '', etiqueta: '', orden: '' })
      setOk(`Ítem «${clave}» creado.`)
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  async function guardarEdicion(id: number) {
    try {
      const act = await api.patch<ChecklistReal>(`/checklist-items/${id}`, {
        clave: formEdit.clave.trim().toLowerCase(),
        etiqueta: formEdit.etiqueta.trim(),
        orden: formEdit.orden,
      })
      setItems((prev) => prev.map((it) => (it.id === id ? act : it)).sort((a, b) => a.orden - b.orden || a.id - b.id))
      setEditando(null)
      setOk(`Ítem ${act.clave} actualizado.`)
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  async function alternarActivo(it: ChecklistReal) {
    const nuevoActivo = esActivo(it) ? 0 : 1
    try {
      await api.patch<ChecklistReal>(`/checklist-items/${it.id}`, { activo: nuevoActivo })
      if (nuevoActivo === 0) {
        setItems((prev) => prev.filter((x) => x.id !== it.id))
        setInactivos((prev) => [...prev.filter((x) => x.id !== it.id), { ...it, activo: 0 }])
        setOk(`«${it.clave}» desactivado. Volverá al checklist al reactivarlo.`)
      } else {
        setInactivos((prev) => prev.filter((x) => x.id !== it.id))
        setItems((prev) => [...prev, { ...it, activo: 1 }].sort((a, b) => a.orden - b.orden || a.id - b.id))
        setOk(`«${it.clave}» reactivado.`)
      }
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  async function eliminar(id: number, clave: string) {
    try {
      await api.del(`/checklist-items/${id}`)
      setItems((prev) => prev.filter((x) => x.id !== id))
      setInactivos((prev) => prev.filter((x) => x.id !== id))
      setOk(`Ítem «${clave}» eliminado.`)
    } catch (e) {
      setError(mensajeError(e))
    }
  }

  return (
    <fieldset className="min-w-0 rounded-xl border border-border bg-surface p-4" disabled={soloLectura}>
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-text2">
        <ClipboardIcon size={18} /> Checklist configurable
      </legend>

      {cargando && <p role="status" className="text-sm text-text2">Cargando ítems…</p>}
      {error && <Aviso tipo="err">{error}</Aviso>}
      {ok && !error && <Aviso tipo="ok">{ok}</Aviso>}

      <div className="max-w-full overflow-x-auto">
      <table className="w-full border-collapse text-sm" aria-label="Ítems activos del checklist">
        <thead>
          <tr className="border-b border-border text-left text-text2">
            <th scope="col" className="py-2 pr-2">Orden</th>
            <th scope="col" className="py-2 pr-2">Clave</th>
            <th scope="col" className="py-2 pr-2">Etiqueta</th>
            {esAdmin && <th scope="col" className="py-2 text-right">Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-border/50">
              {editando === it.id ? (
                <>
                  <td className="py-1 pr-2">
                    <label className="sr-only" htmlFor={`ord-${it.id}`}>Orden del ítem {it.clave}</label>
                    <input
                      id={`ord-${it.id}`}
                      type="number"
                      className="h-10 w-16 rounded border border-border bg-bg2 px-1 font-mono text-text"
                      value={formEdit.orden}
                      onChange={(e) => setFormEdit({ ...formEdit, orden: Number(e.target.value) })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <label className="sr-only" htmlFor={`cla-${it.id}`}>Clave del ítem</label>
                    <input
                      id={`cla-${it.id}`}
                      className="h-10 w-32 rounded border border-border bg-bg2 px-1 font-mono text-text"
                      value={formEdit.clave}
                      onChange={(e) => setFormEdit({ ...formEdit, clave: e.target.value })}
                    />
                  </td>
                  <td className="py-1 pr-2">
                    <label className="sr-only" htmlFor={`eti-${it.id}`}>Etiqueta del ítem</label>
                    <input
                      id={`eti-${it.id}`}
                      className="h-10 w-full rounded border border-border bg-bg2 px-1 text-text"
                      value={formEdit.etiqueta}
                      onChange={(e) => setFormEdit({ ...formEdit, etiqueta: e.target.value })}
                    />
                  </td>
                  <td className="py-1">
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => void guardarEdicion(it.id)} className="flex min-h-10 items-center gap-1 rounded-lg border border-ok px-2 text-xs font-semibold text-ok">
                        <CheckIcon size={14} /> Guardar
                      </button>
                      <button type="button" onClick={() => setEditando(null)} className="flex min-h-10 items-center gap-1 rounded-lg border border-border px-2 text-xs text-text2">
                        <CloseIcon size={14} /> Cancelar
                      </button>
                    </div>
                  </td>
                </>
              ) : (
                <>
                  <td className="py-1 pr-2 font-mono text-text2">{it.orden}</td>
                  <td className="py-1 pr-2 font-mono font-semibold text-text">{it.clave}</td>
                  <td className="py-1 pr-2">{it.etiqueta}</td>
                  {esAdmin && (
                    <td className="py-1">
                      <div className="flex flex-wrap justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setEditando(it.id)
                            setFormEdit({ clave: it.clave, etiqueta: it.etiqueta, orden: it.orden })
                          }}
                          aria-label={`Editar ítem ${it.clave}`}
                          className="min-h-10 rounded-lg border border-primary px-2 text-xs font-semibold text-primary"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => void alternarActivo(it)}
                          aria-label={`${esActivo(it) ? 'Desactivar' : 'Activar'} ítem ${it.clave}`}
                          className="min-h-10 rounded-lg border border-warn px-2 text-xs font-semibold text-warn"
                        >
                          {esActivo(it) ? 'Desactivar' : 'Activar'}
                        </button>
                        <BotonConfirmar
                          etiqueta="Baja"
                          etiquetaConfirmar="Confirmar baja"
                          ariaLabel={`Eliminar ítem ${it.clave}`}
                          onConfirmar={() => eliminar(it.id, it.clave)}
                        />
                      </div>
                    </td>
                  )}
                </>
              )}
            </tr>
          ))}
          {!cargando && items.length === 0 && (
            <tr>
              <td colSpan={esAdmin ? 4 : 3} className="py-4 text-center text-text2">
                Sin ítems activos.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {inactivos.length > 0 && (
        <div className="mt-3 rounded-lg border border-dashed border-warn/60 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warn">Inactivos (solo visibles en esta sesión)</p>
          <ul className="flex flex-col gap-2" aria-label="Ítems inactivos">
            {inactivos.map((it) => (
              <li key={it.id} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate font-mono text-text2">{it.clave} · {it.etiqueta}</span>
                {esAdmin && (
                  <button
                    type="button"
                    onClick={() => void alternarActivo({ ...it, activo: 0 } as ChecklistReal)}
                    className="min-h-10 rounded-lg border border-ok px-2 text-xs font-semibold text-ok"
                    aria-label={`Reactivar ítem ${it.clave}`}
                  >
                    Reactivar
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {esAdmin && (
        <div className="mt-4 rounded-lg border border-border bg-bg2 p-3">
          <p className="mb-2 text-sm font-semibold">Nuevo ítem</p>
          <div className="grid gap-3 sm:grid-cols-[1fr_2fr_auto]">
            <div>
              <label htmlFor="chk-clave" className="block text-xs text-text2">Clave</label>
              <input id="chk-clave" className={inputCls} placeholder="presion_rango" value={alta.clave} onChange={(e) => setAlta({ ...alta, clave: e.target.value })} />
              <CampoError>{erroresAlta.clave}</CampoError>
            </div>
            <div>
              <label htmlFor="chk-etiqueta" className="block text-xs text-text2">Etiqueta visible</label>
              <input id="chk-etiqueta" className={inputCls} placeholder="Presión en rango (manómetro verde)" value={alta.etiqueta} onChange={(e) => setAlta({ ...alta, etiqueta: e.target.value })} />
              <CampoError>{erroresAlta.etiqueta}</CampoError>
            </div>
            <div>
              <label htmlFor="chk-orden" className="block text-xs text-text2">Orden</label>
              <input id="chk-orden" type="number" className={`${inputCls} w-24 font-mono`} value={alta.orden} onChange={(e) => setAlta({ ...alta, orden: e.target.value })} />
              <CampoError>{erroresAlta.orden}</CampoError>
            </div>
          </div>
          <button type="button" onClick={() => void crear()} className="mt-3 flex min-h-14 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary">
            <CheckIcon size={18} /> Crear ítem
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-text2">
        Los ítems con falla de claves críticas (presion_rango, precinto_intacto, manguera_sin_fisuras) provocan rechazo del
        extintor al inspeccionar. Nota: el backend solo lista ítems activos; un ítem desactivado deja de mostrarse al recargar.
      </p>
    </fieldset>
  )
}
