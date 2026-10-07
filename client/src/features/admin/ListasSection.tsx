/**
 * Listas desplegables configurables (tipos de extintor y ubicaciones).
 * Fuente de verdad: PATCH/GET /settings (configTipos[] / configUbicaciones[]).
 * localStorage (listasConfig.ts) queda como espejo/fallback offline del dispositivo.
 */
import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { CheckIcon, CloseIcon, SearchIcon } from '../../components/icons'
import { Aviso, BotonConfirmar, inputCls } from './UI'
import { KEY_TIPOS, KEY_UBICACIONES, escribirTipos, escribirUbicaciones, escribirHallazgos, leerTipos, leerUbicaciones, leerHallazgos } from './listasConfig'
import type { ExtinguisherReal, RespuestaPaginada, SettingsReal } from './tipos'

interface Props {
  esAdmin: boolean
  settings: SettingsReal | null
  onListas: (tipos: string[], ubicaciones: string[]) => void
  onGuardado?: (s: SettingsReal) => void
}

function EditorLista({
  titulo,
  etiqueta,
  items,
  soloLectura,
  onChange,
}: {
  titulo: string
  etiqueta: string
  items: string[]
  soloLectura: boolean
  onChange: (v: string[]) => void
}) {
  const [nuevo, setNuevo] = useState('')
  const [editando, setEditando] = useState<number | null>(null)
  const [textoEdit, setTextoEdit] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  function agregar() {
    const v = nuevo.trim()
    setAviso(null)
    if (!v) return
    if (items.some((x) => x.toLowerCase() === v.toLowerCase())) {
      setAviso(`«${v}» ya existe en la lista.`)
      return
    }
    onChange([...items, v])
    setNuevo('')
  }

  function renombrar(idx: number) {
    const v = textoEdit.trim()
    if (!v || v === items[idx]) {
      setEditando(null)
      return
    }
    const copia = [...items]
    copia[idx] = v
    onChange(copia)
    setEditando(null)
  }

  return (
    <div className="rounded-lg border border-border bg-bg2 p-3">
      <p className="mb-2 text-sm font-semibold">{titulo}</p>
      {aviso && <p role="alert" className="mb-2 text-xs text-warn">{aviso}</p>}
      <ul className="flex flex-col gap-2" aria-label={etiqueta}>
        {items.map((v, idx) => (
          <li key={`${v}-${idx}`} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3">
            {editando === idx ? (
              <>
                <label className="sr-only" htmlFor={`ren-${idx}`}>Renombrar «{v}»</label>
                <input
                  id={`ren-${idx}`}
                  value={textoEdit}
                  onChange={(e) => setTextoEdit(e.target.value)}
                  className="h-10 min-w-0 flex-1 rounded border border-border bg-bg2 px-2 text-sm text-text"
                  autoFocus
                />
                <button type="button" onClick={() => renombrar(idx)} aria-label={`Guardar renombre de ${v}`} className="flex min-h-10 items-center gap-1 rounded-lg border border-ok px-2 text-xs font-semibold text-ok">
                  <CheckIcon size={14} /> OK
                </button>
                <button type="button" onClick={() => setEditando(null)} aria-label={`Cancelar renombre de ${v}`} className="flex min-h-10 items-center rounded-lg border border-border px-2 text-xs text-text2">
                  <CloseIcon size={14} />
                </button>
              </>
            ) : (
              <>
                <span className="min-w-0 flex-1 truncate text-sm text-text">{v}</span>
                {!soloLectura && (
                  <span className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditando(idx)
                        setTextoEdit(v)
                      }}
                      aria-label={`Renombrar ${v}`}
                      className="min-h-10 rounded-lg border border-primary px-2 text-xs font-semibold text-primary"
                    >
                      Renombrar
                    </button>
                    <BotonConfirmar
                      etiqueta="Quitar"
                      etiquetaConfirmar="Confirmar"
                      ariaLabel={`Quitar ${v} de ${titulo}`}
                      clase="border-err text-err"
                      onConfirmar={() => onChange(items.filter((_, i) => i !== idx))}
                    />
                  </span>
                )}
              </>
            )}
          </li>
        ))}
        {items.length === 0 && <li className="py-2 text-sm text-text2">Sin valores; agregue el primero abajo.</li>}
      </ul>
      {!soloLectura && (
        <div className="mt-2 flex gap-2">
          <label className="sr-only" htmlFor={`nuevo-${etiqueta}`}>Nuevo valor para {titulo}</label>
          <input
            id={`nuevo-${etiqueta}`}
            className={inputCls}
            placeholder={`Nuevo valor de ${titulo.toLowerCase()}`}
            value={nuevo}
            onChange={(e) => setNuevo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                agregar()
              }
            }}
          />
          <button type="button" onClick={agregar} className="flex min-h-14 shrink-0 items-center gap-1 rounded-lg bg-primary px-3 text-sm font-semibold text-on-primary">
            <CheckIcon size={16} /> Agregar
          </button>
        </div>
      )}
    </div>
  )
}

export default function ListasSection({ esAdmin, settings, onListas, onGuardado }: Props) {
  const [tipos, setTipos] = useState<string[]>(leerTipos)
  const [ubicaciones, setUbicaciones] = useState<string[]>(leerUbicaciones)
  const [hallazgos, setHallazgos] = useState<string[]>(leerHallazgos)
  const [semillaCargada, setSemillaCargada] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  // hidratación desde /settings del server (si tiene listas, mandan sobre el localStorage)
  useEffect(() => {
    if (!settings) return
    const t = Array.isArray(settings.configTipos) && settings.configTipos.length ? settings.configTipos : null
    const u = Array.isArray(settings.configUbicaciones) && settings.configUbicaciones.length ? settings.configUbicaciones : null
    const h = Array.isArray((settings as SettingsReal & { configHallazgos?: string[] }).configHallazgos) && (settings as SettingsReal & { configHallazgos?: string[] }).configHallazgos!.length ? (settings as SettingsReal & { configHallazgos?: string[] }).configHallazgos! : null
    if (!t && !u && !h) return
    if (t) { escribirTipos(t); setTipos(t) }
    if (u) { escribirUbicaciones(u); setUbicaciones(u) }
    if (h) { escribirHallazgos(h); setHallazgos(h) }
    onListas(t ?? leerTipos(), u ?? leerUbicaciones())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  // si el dispositivo está limpio, sembrar con los valores existentes en la base
  useEffect(() => {
    let vivo = true
    api
      .get<RespuestaPaginada<ExtinguisherReal>>('/extinguishers?page=1&size=100')
      .then((r) => {
        if (!vivo) return
        const t = [...new Set(r.items.map((i) => i.tipo).filter(Boolean))] as string[]
        const u = [...new Set(r.items.map((i) => i.ubicacion).filter(Boolean))] as string[]
        try {
          const limpio = !localStorage.getItem(KEY_TIPOS) && !localStorage.getItem(KEY_UBICACIONES)
          if (limpio && (t.length || u.length)) {
            if (t.length) escribirTipos(t)
            if (u.length) escribirUbicaciones(u)
            setTipos(t.length ? t : leerTipos())
            setUbicaciones(u.length ? u : leerUbicaciones())
            setSemillaCargada(true)
            onListas(t.length ? t : leerTipos(), u.length ? u : leerUbicaciones())
          } else {
            setSemillaCargada(true)
          }
        } catch {
          setSemillaCargada(true)
        }
      })
      .catch(() => {
        if (vivo) setSemillaCargada(true)
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function persistir(key: 'configTipos' | 'configUbicaciones' | 'configHallazgos', v: string[]) {
    if (!esAdmin) return
    api
      .patch<SettingsReal>('/settings', { [key]: v })
      .then((s) => {
        onGuardado?.(s)
        setAviso(`Listas guardadas en el servidor (${key}).`)
      })
      .catch((e: unknown) => {
        const msg = e instanceof Error ? e.message : String(e)
        setAviso(`No se pudo guardar en el servidor (${msg}); quedó solo en este dispositivo.`)
      })
  }

  function cambiarTipos(v: string[]) {
    setTipos(v)
    escribirTipos(v)
    onListas(v, ubicaciones)
    persistir('configTipos', v)
    if (!esAdmin) setAviso('Tipos actualizados en este dispositivo (localStorage).')
  }

  function cambiarUbicaciones(v: string[]) {
    setUbicaciones(v)
    escribirUbicaciones(v)
    onListas(tipos, v)
    persistir('configUbicaciones', v)
    if (!esAdmin) setAviso('Ubicaciones actualizadas en este dispositivo (localStorage).')
  }

  function cambiarHallazgos(v: string[]) {
    setHallazgos(v)
    escribirHallazgos(v)
    persistir('configHallazgos', v)
    if (!esAdmin) setAviso('Hallazgos actualizados en este dispositivo (localStorage).')
  }

  return (
    <fieldset className="min-w-0 rounded-xl border border-border bg-surface p-4">
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-text2">
        <SearchIcon size={18} /> Listas desplegables de la app
      </legend>
      {aviso && <Aviso tipo="info">{aviso}</Aviso>}
      {!semillaCargada && <p role="status" className="text-sm text-text2">Sembrando listas desde la base…</p>}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <EditorLista titulo="Tipos de extintor" etiqueta="Tipos de extintor configurados" items={tipos} soloLectura={!esAdmin} onChange={cambiarTipos} />
        <EditorLista titulo="Ubicaciones" etiqueta="Ubicaciones configuradas" items={ubicaciones} soloLectura={!esAdmin} onChange={cambiarUbicaciones} />
        <EditorLista titulo="Hallazgos de terreno" etiqueta="Hallazgos de terreno configurados" items={hallazgos} soloLectura={!esAdmin} onChange={cambiarHallazgos} />
      </div>
      <p className="mt-3 text-xs text-text2">
        Las listas se guardan en el servidor vía PATCH /settings (configTipos[] / configUbicaciones[]) y se hidratan
        desde GET /settings o /public-config. Además quedan en localStorage (nfpa_config_tipos / nfpa_config_ubicaciones)
        como respaldo offline del dispositivo y alimentan los {'<select>'} del alta de extintores.
      </p>
    </fieldset>
  )
}
