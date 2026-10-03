/**
 * Extintores (solo lectura para supervisor): alta rápida con selects configurables y
 * validación inline + listado con edición inline (PATCH — el tag no se renombra en el
 * backend; se editan los campos del extintor identificado por su tag) y soft delete.
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../../lib/api'
import { CheckIcon, ClipboardIcon } from '../../components/icons'
import { Aviso, BotonConfirmar, inputCls } from './UI'
import { fechaCorta } from '../dashboard/semforo'
import type { ExtinguisherReal, EstadoCalculadoReal, RespuestaPaginada } from './tipos'

const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/

const ESTADO_UI: Record<EstadoCalculadoReal, { texto: string; clase: string }> = {
  vigente: { texto: 'Vigente', clase: 'text-ok' },
  por_vencer: { texto: 'Por vencer', clase: 'text-warn' },
  vencido: { texto: 'Vencido', clase: 'text-err' },
  rechazado: { texto: 'Rechazado', clase: 'text-err bg-bg2 border-2 border-err' },
  sin_inspeccionar: { texto: 'Sin inspeccionar', clase: 'text-info' },
}

const CAPACIDADES = [1, 2, 4, 6, 9, 12, 20]

interface Props {
  esAdmin: boolean
  tipos: string[]
  ubicaciones: string[]
}

export default function ExtintoresSection({ esAdmin, tipos, ubicaciones }: Props) {
  const [items, setItems] = useState<ExtinguisherReal[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [alta, setAlta] = useState({ tag: '', ubicacion: '', tipo: '', agente: '', capacidad: '4', presion: '', fecha: '' })
  const AGENTES = ['PQS', 'CO2', 'AGUA', 'BC', 'K']
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [enviando, setEnviando] = useState(false)

  const [editando, setEditando] = useState<string | null>(null)
  const [formEdit, setFormEdit] = useState({ tipo: '', ubicacion: '', capacidad: '', presion: '', notas: '', agente: '', ultimaRecarga: '', vencRecarga: '', vencHidro: '' })

  const cargar = useCallback(() => {
    setCargando(true)
    api
      .get<RespuestaPaginada<ExtinguisherReal>>('/extinguishers?page=1&size=200')
      .then((r) => setItems(r.items))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : 'No se pudo cargar el inventario.'))
      .finally(() => setCargando(false))
  }, [])

  useEffect(cargar, [cargar])

  function msg(e: unknown): string {
    if (e instanceof ApiError) {
      const d = e.detail as { msg?: string } | null
      return d?.msg ?? e.message
    }
    return e instanceof Error ? e.message : 'Error inesperado.'
  }

  function validarAlta(): Record<string, string> {
    const errs: Record<string, string> = {}
    const tag = alta.tag.trim().toUpperCase()
    if (!tag) errs.tag = 'El tag es obligatorio.'
    else if (!TAG_RE.test(tag)) errs.tag = 'Tag: 2-32 caracteres alfanuméricos (admite - y _), debe empezar con letra o dígito.'
    if (!alta.ubicacion) errs.ubicacion = 'Seleccione una ubicación (configurable en «Listas desplegables»).'
    if (!alta.tipo) errs.tipo = 'Seleccione un tipo (configurable en «Listas desplegables»).'
    const cap = Number(alta.capacidad)
    if (!Number.isFinite(cap) || cap <= 0 || cap > 500) errs.capacidad = 'Capacidad inválida (0–500 L).'
    if (alta.presion !== '') {
      const p = Number(alta.presion)
      if (!Number.isFinite(p) || p <= 0 || p > 100) errs.presion = 'Presión inválida.'
    }
    return errs
  }

  async function onSubmitAlta(ev: FormEvent) {
    ev.preventDefault()
    const errs = validarAlta()
    setErrores(errs)
    if (Object.keys(errs).length) return
    setEnviando(true)
    setError(null)
    setOk(null)
    try {
      const creado = await api.post<ExtinguisherReal>('/extinguishers', {
        tag: alta.tag.trim().toUpperCase(),
        ubicacion: alta.ubicacion,
        tipo: alta.tipo,
        capacidad_l: Number(alta.capacidad),
        ...(alta.presion !== '' ? { presion_bar: Number(alta.presion) } : {}),
        ...(alta.fecha ? { fecha_fabricacion: alta.fecha } : {}),
        ...(alta.agente ? { agente: alta.agente } : {}),
      })
      setItems((prev) => [...prev, creado].sort((a, b) => a.tag.localeCompare(b.tag)))
      setAlta({ ...alta, tag: '' })
      setOk(`Extintor ${creado.tag} registrado.`)
    } catch (e) {
      setError(msg(e))
    } finally {
      setEnviando(false)
    }
  }

  async function guardarEdicion(tag: string) {
    setError(null)
    setOk(null)
    try {
      const actualizado = await api.patch<ExtinguisherReal>(`/extinguishers/${encodeURIComponent(tag)}`, {
        tipo: formEdit.tipo || undefined,
        ubicacion: formEdit.ubicacion || undefined,
        capacidad_l: formEdit.capacidad !== '' ? Number(formEdit.capacidad) : undefined,
        presion_bar: formEdit.presion !== '' ? Number(formEdit.presion) : undefined,
        notas: formEdit.notas,
        agente: formEdit.agente || undefined,
        ultima_recarga: formEdit.ultimaRecarga || undefined,
        venc_recarga: formEdit.vencRecarga || undefined,
        venc_hidro: formEdit.vencHidro || undefined,
      })
      setItems((prev) => prev.map((x) => (x.tag === tag ? actualizado : x)))
      setEditando(null)
      setOk(`Extintor ${tag} actualizado (el tag no se renombra: así lo fija el backend).`)
    } catch (e) {
      setError(msg(e))
    }
  }

  async function darDeBaja(tag: string) {
    setError(null)
    setOk(null)
    try {
      await api.del(`/extinguishers/${encodeURIComponent(tag)}`)
      setItems((prev) => prev.filter((x) => x.tag !== tag))
      setOk(`Extintor ${tag} dado de baja (soft delete: activo=false; los QR impresos quedan inofensivos).`)
    } catch (e) {
      setError(msg(e))
    }
  }

  return (
    <fieldset className="rounded-xl border border-border bg-surface p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-text2">
        <ClipboardIcon size={18} /> Extintores
      </legend>
      {!esAdmin && (
        <p className="mb-2 text-xs text-text2" role="note">
          Vista de solo lectura: el alta y la baja de extintores requieren rol admin.
        </p>
      )}
      {error && <Aviso tipo="err">{error}</Aviso>}
      {ok && !error && <Aviso tipo="ok">{ok}</Aviso>}

      {esAdmin && (
        <form onSubmit={(e) => void onSubmitAlta(e)} noValidate className="mb-4 grid gap-3 rounded-lg border border-border bg-bg2 p-3 sm:grid-cols-2">
          <p className="text-sm font-semibold sm:col-span-2">Alta rápida</p>
          <div>
            <label htmlFor="ext-tag" className="block text-xs text-text2">Tag *</label>
            <input id="ext-tag" className={`${inputCls} font-mono uppercase`} placeholder="EXT-PAS-014" value={alta.tag} onChange={(e) => setAlta({ ...alta, tag: e.target.value })} aria-invalid={errores.tag ? true : undefined} />
            {errores.tag && <p role="alert" className="mt-1 text-xs text-err">{errores.tag}</p>}
          </div>
          <div>
            <label htmlFor="ext-ub" className="block text-xs text-text2">Ubicación *</label>
            <select id="ext-ub" className={inputCls} value={alta.ubicacion} onChange={(e) => setAlta({ ...alta, ubicacion: e.target.value })} aria-invalid={errores.ubicacion ? true : undefined}>
              <option value="">(seleccione)</option>
              {ubicaciones.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            {errores.ubicacion && <p role="alert" className="mt-1 text-xs text-err">{errores.ubicacion}</p>}
          </div>
          <div>
            <label htmlFor="ext-tipo" className="block text-xs text-text2">Tipo *</label>
            <select id="ext-tipo" className={inputCls} value={alta.tipo} onChange={(e) => setAlta({ ...alta, tipo: e.target.value })} aria-invalid={errores.tipo ? true : undefined}>
              <option value="">(seleccione)</option>
              {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            {errores.tipo && <p role="alert" className="mt-1 text-xs text-err">{errores.tipo}</p>}
          </div>
          <div>
            <label htmlFor="ext-cap" className="block text-xs text-text2">Capacidad (L) *</label>
            <select id="ext-cap" className={inputCls} value={alta.capacidad} onChange={(e) => setAlta({ ...alta, capacidad: e.target.value })}>
              {CAPACIDADES.map((c) => <option key={c} value={c}>{c} L</option>)}
            </select>
            {errores.capacidad && <p role="alert" className="mt-1 text-xs text-err">{errores.capacidad}</p>}
          </div>
          <div>
            <label htmlFor="ext-pres" className="block text-xs text-text2">Presión (bar, opcional)</label>
            <input id="ext-pres" type="number" inputMode="decimal" step="0.5" className={`${inputCls} font-mono`} placeholder="ej. 15" value={alta.presion} onChange={(e) => setAlta({ ...alta, presion: e.target.value })} />
            {errores.presion && <p role="alert" className="mt-1 text-xs text-err">{errores.presion}</p>}
          </div>
          <div>
            <label htmlFor="ext-fecha" className="block text-xs text-text2">Fecha de fabricación (opcional)</label>
            <input id="ext-fecha" type="date" className={`${inputCls} font-mono`} value={alta.fecha} onChange={(e) => setAlta({ ...alta, fecha: e.target.value })} />
          </div>
          <div>
            <label htmlFor="ext-agente" className="block text-xs text-text2">Agente NFPA (regla hidrostática 5/12 a)</label>
            <select id="ext-agente" className={inputCls} value={alta.agente} onChange={(e) => setAlta({ ...alta, agente: e.target.value })}>
              <option value="">(sin declarar — regla por defecto 5 a)</option>
              {AGENTES.map((a) => <option key={a} value={a}>{a}{a === 'PQS' ? ' (hidrostática 12 a)' : ' (hidrostática 5 a)'}</option>)}
            </select>
          </div>
          <button type="submit" disabled={enviando} aria-busy={enviando} className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-60 sm:col-span-2">
            <CheckIcon size={18} /> {enviando ? 'Registrando…' : 'Registrar extintor'}
          </button>
        </form>
      )}

      {cargando ? (
        <p role="status" className="text-sm text-text2">Cargando inventario…</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse text-sm" aria-label="Inventario de extintores activos">
            <thead>
              <tr className="border-b border-border text-left text-text2">
                <th scope="col" className="py-2 pr-2">Tag</th>
                <th scope="col" className="py-2 pr-2">Ubicación</th>
                <th scope="col" className="py-2 pr-2">Tipo</th>
                <th scope="col" className="py-2 pr-2">Cap.</th>
                <th scope="col" className="py-2 pr-2">Vence</th>
                <th scope="col" className="py-2 pr-2">Estado</th>
                {esAdmin && <th scope="col" className="py-2 text-right">Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const est = ESTADO_UI[it.estadoCalculado] ?? ESTADO_UI.sin_inspeccionar
                return (
                  <tr key={it.tag} className={`border-b border-border/50 ${editando === it.tag ? 'bg-bg2' : ''}`}>
                    <td className="py-2 pr-2 font-mono font-semibold text-text">{it.tag}</td>
                    <td className="py-2 pr-2">{it.ubicacion}</td>
                    <td className="py-2 pr-2">{it.tipo || '—'}</td>
                    <td className="py-2 pr-2 font-mono">{it.capacidad_l ?? '—'}</td>
                    <td className="py-2 pr-2 font-mono">{fechaCorta(it.proximo_vencimiento)}</td>
                    <td className="py-2 pr-2">
                      <span className={`rounded-full px-2 py-1 text-xs font-semibold ${est.clase}`}>{est.texto}</span>
                    </td>
                    {esAdmin && (
                      <td className="py-2">
                        <div className="flex justify-end gap-2">
                          {editando === it.tag ? (
                            <>
                              <button type="button" onClick={() => void guardarEdicion(it.tag)} aria-label={`Guardar cambios de ${it.tag}`} className="flex min-h-10 items-center gap-1 rounded-lg border border-ok px-2 text-xs font-semibold text-ok">
                                <CheckIcon size={14} /> Guardar
                              </button>
                              <button type="button" onClick={() => setEditando(null)} aria-label={`Cancelar edición de ${it.tag}`} className="min-h-10 rounded-lg border border-border px-2 text-xs text-text2">
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditando(it.tag)
                                  setFormEdit({
                                    tipo: it.tipo ?? '',
                                    ubicacion: it.ubicacion ?? '',
                                    capacidad: it.capacidad_l != null ? String(it.capacidad_l) : '',
                                    presion: it.presion_bar != null ? String(it.presion_bar) : '',
                                    notas: it.notas ?? '',
                                    agente: it.agente ?? '',
                                    ultimaRecarga: it.ultima_recarga ? String(it.ultima_recarga).slice(0, 10) : '',
                                    vencRecarga: it.venc_recarga ? String(it.venc_recarga).slice(0, 10) : '',
                                    vencHidro: it.venc_hidro ? String(it.venc_hidro).slice(0, 10) : '',
                                  })
                                }}
                                aria-label={`Editar extintor ${it.tag}`}
                                className="min-h-10 rounded-lg border border-primary px-2 text-xs font-semibold text-primary"
                              >
                                Editar
                              </button>
                              <BotonConfirmar
                                etiqueta="Baja"
                                etiquetaConfirmar="Confirmar baja"
                                ariaLabel={`Dar de baja soft el extintor ${it.tag}`}
                                onConfirmar={() => darDeBaja(it.tag)}
                              />
                            </>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                )
              })}
              {items.length === 0 && (
                <tr>
                  <td colSpan={esAdmin ? 7 : 6} className="py-6 text-center text-text2">Sin extintores activos.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {editando && (
        <div className="mt-3 rounded-lg border border-primary/40 bg-bg2 p-3">
          <p className="mb-2 text-sm font-semibold">Editando {editando}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="ed-tipo" className="block text-xs text-text2">Tipo</label>
              <select id="ed-tipo" className={inputCls} value={formEdit.tipo} onChange={(e) => setFormEdit({ ...formEdit, tipo: e.target.value })}>
                <option value="">(sin cambio)</option>
                {tipos.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ed-ub" className="block text-xs text-text2">Ubicación</label>
              <select id="ed-ub" className={inputCls} value={formEdit.ubicacion} onChange={(e) => setFormEdit({ ...formEdit, ubicacion: e.target.value })}>
                <option value="">(sin cambio)</option>
                {ubicaciones.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ed-cap" className="block text-xs text-text2">Capacidad (L)</label>
              <input id="ed-cap" type="number" className={`${inputCls} font-mono`} value={formEdit.capacidad} onChange={(e) => setFormEdit({ ...formEdit, capacidad: e.target.value })} />
            </div>
            <div>
              <label htmlFor="ed-pres" className="block text-xs text-text2">Presión (bar)</label>
              <input id="ed-pres" type="number" step="0.5" className={`${inputCls} font-mono`} value={formEdit.presion} onChange={(e) => setFormEdit({ ...formEdit, presion: e.target.value })} />
            </div>
            <div>
              <label htmlFor="ed-agente" className="block text-xs text-text2">Agente NFPA</label>
              <select id="ed-agente" className={inputCls} value={formEdit.agente} onChange={(e) => setFormEdit({ ...formEdit, agente: e.target.value })}>
                <option value="">(sin cambio)</option>
                {AGENTES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ed-ur" className="block text-xs text-text2">Última recarga (taller)</label>
              <input id="ed-ur" type="date" className={`${inputCls} font-mono`} value={formEdit.ultimaRecarga} onChange={(e) => setFormEdit({ ...formEdit, ultimaRecarga: e.target.value })} />
            </div>
            <div>
              <label htmlFor="ed-vr" className="block text-xs text-text2">Vencimiento recarga</label>
              <input id="ed-vr" type="date" className={`${inputCls} font-mono`} value={formEdit.vencRecarga} onChange={(e) => setFormEdit({ ...formEdit, vencRecarga: e.target.value })} />
            </div>
            <div>
              <label htmlFor="ed-vh" className="block text-xs text-text2">Vencimiento hidrostática</label>
              <input id="ed-vh" type="date" className={`${inputCls} font-mono`} value={formEdit.vencHidro} onChange={(e) => setFormEdit({ ...formEdit, vencHidro: e.target.value })} />
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="ed-notas" className="block text-xs text-text2">Notas</label>
              <textarea id="ed-notas" rows={2} className={inputCls} value={formEdit.notas} onChange={(e) => setFormEdit({ ...formEdit, notas: e.target.value })} />
            </div>
          </div>
        </div>
      )}
    </fieldset>
  )
}
