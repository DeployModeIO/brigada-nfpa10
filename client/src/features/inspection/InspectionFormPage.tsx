/**
 * /inspeccion/:tag — formulario de inspección NFPA 10 contra el backend real:
 * ficha del extintor (GET /extinguishers/:tag con caché IndexedDB como respaldo offline),
 * checklist configurable con interruptores Pasa/Falla ≥56px, evidencia fotográfica comprimida,
 * GPS opcional, guardado online (POST /inspections) o en cola offline (enqueueInspection),
 * e historial de las últimas 5 inspecciones del tag.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { ApiError, api } from '../../lib/api'
import {
  cacheGet,
  cachePut,
  enqueueInspection,
  getSetting,
  pendingCount,
  setSetting,
} from '../../lib/offline'

import {
  AlertIcon,
  CameraIcon,
  CheckIcon,
  ClipboardIcon,
  CloseIcon,
  GearIcon,
  LocationIcon,
  OfflineIcon,
  ScanIcon,
} from '../../components/icons'
import CheckItem from './CheckItem'
import StatusBadge from './StatusBadge'
import Toast, { type ToastData } from './Toast'
import { comprimirImagen } from './photo'
import { verificarCoincidenciaGps } from '../scanner/geo'
import {
  CRITICAS,
  fechaCorta,
  fechaHora,
  msgError,
  type ChecklistRow,
  type ExtDto,
  type InspRow,
  type InspeccionCreada,
  type InspeccionPayload,
  type Pag,
} from './apiTypes'

type GpsEstado = 'idle' | 'busy' | 'ok' | 'err'

const MAX_FOTO_CHARS = 3_900_000

export default function InspectionFormPage() {
  const { tag: tagParam } = useParams<{ tag: string }>()
  const tag = useMemo(() => (tagParam ?? '').toUpperCase(), [tagParam])

  const [ext, setExt] = useState<ExtDto | null>(null)
  const [desdeCache, setDesdeCache] = useState(false)
  const [items, setItems] = useState<ChecklistRow[]>([])
  const [cargando, setCargando] = useState(true)
  const [errorCarga, setErrorCarga] = useState<string | null>(null)

  const [resp, setResp] = useState<Record<string, boolean>>({})
  const [respondido, setRespondido] = useState<Record<string, boolean>>({})
  const [intentosSubmit, setIntentosSubmit] = useState(0)

  const [foto, setFoto] = useState<{ dataUrl: string; base64: string } | null>(null)
  const [fotoBusy, setFotoBusy] = useState(false)
  const [fotoError, setFotoError] = useState<string | null>(null)
  const inputFotoRef = useRef<HTMLInputElement | null>(null)

  const [gps, setGps] = useState<{ lat: number; lng: number; precision: number } | null>(null)
  const [gpsEstado, setGpsEstado] = useState<GpsEstado>('idle')
  const [gpsMsg, setGpsMsg] = useState<string | null>(null)

  const [obs, setObs] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)

  const [guardadoLocal, setGuardadoLocal] = useState(false)
  const [pendientes, setPendientes] = useState<number | null>(null)
  const [online, setOnline] = useState(() => navigator.onLine)

  const [historial, setHistorial] = useState<InspRow[] | null>(null)
  const [histRefresh, setHistRefresh] = useState(0)

  useEffect(() => {
    const al = () => setOnline(true)
    const ol = () => setOnline(false)
    window.addEventListener('online', al)
    window.addEventListener('offline', ol)
    return () => {
      window.removeEventListener('online', al)
      window.removeEventListener('offline', ol)
    }
  }, [])

  useEffect(() => {
    if (!online) return
    // main.tsx drena la cola al volver la conexión; aquí solo refrescamos el contador del banner.
    const t = window.setTimeout(() => {
      void pendingCount()
        .then((n) => {
          setPendientes(n)
          if (n === 0) setGuardadoLocal(false)
        })
        .catch(() => undefined)
    }, 1500)
    return () => window.clearTimeout(t)
  }, [online])

  const cargar = useCallback(async () => {
    if (!tag) return
    setCargando(true)
    setErrorCarga(null)
    setDesdeCache(false)

    try {
      const e = await api.get<ExtDto>(`/extinguishers/${encodeURIComponent(tag)}`)
      setExt(e)
      void cachePut(tag, e as unknown as import('../../lib/types').Extinguisher).catch(() => undefined)
    } catch (err) {
      const c = await cacheGet(tag).catch(() => undefined)
      if (c) {
        setExt(c as unknown as ExtDto)
        setDesdeCache(true)
      } else {
        setExt(null)
        setErrorCarga(msgError(err))
      }
    }

    try {
      const list = await api.get<ChecklistRow[]>('/checklist-items')
      setItems(list)
      void setSetting('checklist-items', list).catch(() => undefined)
    } catch {
      const cached = await getSetting<ChecklistRow[]>('checklist-items').catch(() => undefined)
      setItems(Array.isArray(cached) ? cached : [])
      if (!Array.isArray(cached) || cached.length === 0) setErrorCarga('Checklist no disponible (sin conexión ni caché).')
    }

    setCargando(false)
  }, [tag])

  useEffect(() => {
    void cargar()
  }, [cargar])

  useEffect(() => {
    if (!tag) return
    if (!navigator.onLine) {
      setHistorial(null)
      return
    }
    let vivo = true
    api
      .get<Pag<InspRow>>(`/inspections?tag=${encodeURIComponent(tag)}&size=5`)
      .then((r) => vivo && setHistorial(r.items))
      .catch(() => vivo && setHistorial(null))
    return () => {
      vivo = false
    }
  }, [tag, histRefresh, online])

  const sinResponder = items.filter((i) => !respondido[i.clave])
  const fallas = items.filter((i) => respondido[i.clave] && resp[i.clave] === false)
  const hayFallas = fallas.length > 0

  const responder = (clave: string, v: boolean) => {
    setResp((p) => ({ ...p, [clave]: v }))
    setRespondido((p) => ({ ...p, [clave]: true }))
  }

  const onFoto = async (file: File | undefined) => {
    if (!file) return
    setFotoBusy(true)
    setFotoError(null)
    try {
      const comprimida = await comprimirImagen(file)
      if (comprimida.base64.length > MAX_FOTO_CHARS) {
        setFotoError('La foto sigue muy pesada tras comprimirla; toma otra más cercana.')
        return
      }
      setFoto({ dataUrl: comprimida.dataUrl, base64: comprimida.base64 })
    } catch (e) {
      setFotoError(e instanceof Error ? e.message : 'No se pudo procesar la foto.')
    } finally {
      setFotoBusy(false)
    }
  }

  const capturarGps = () => {
    if (!('geolocation' in navigator)) {
      setGpsEstado('err')
      setGpsMsg('Este navegador no ofrece geolocalización.')
      return
    }
    setGpsEstado('busy')
    setGpsMsg(null)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGps({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy })
        setGpsEstado('ok')
      },
      (err) => {
        setGpsEstado('err')
        setGpsMsg(`GPS no disponible: ${err.message}`)
      },
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  }

  const construirPayload = (): InspeccionPayload => {
    const payload: InspeccionPayload = {
      tag,
      resultados: Object.fromEntries(items.map((i) => [i.clave, resp[i.clave] === true])),
      dispositivo: (navigator.userAgent || 'app-brigada').slice(0, 100),
    }
    if (obs.trim()) payload.observaciones = obs.trim()
    if (foto) payload.foto_evidencia_base64 = foto.base64
    if (gps) payload.gps = { lat: gps.lat, lng: gps.lng }
    return payload
  }

  const guardarEnCola = async (payload: InspeccionPayload) => {
    const id = await enqueueInspection(payload)
    setGuardadoLocal(true)
    setPendientes(await pendingCount().catch(() => null))
    setToast({
      tipo: 'info',
      titulo: 'Guardado local, se sincronizará',
      mensaje: `Inspección de ${tag} en cola offline${id ? ` (#${id})` : ''}. Al recuperar conexión se envía sola.`,
    })
  }

  const onGuardar = async (ev?: FormEvent) => {
    ev?.preventDefault()
    if (enviando || items.length === 0) return
    if (sinResponder.length > 0) {
      setIntentosSubmit((n) => n + 1)
      const primero = sinResponder[0]
      document.getElementById(`item-${primero.clave}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setEnviando(true)
    const payload = construirPayload()
    const nFallas = fallas.length
    try {
      if (!navigator.onLine) throw new ApiError(0, 'Sin conexión')
      const r = await api.post<InspeccionCreada>('/inspections', payload)
      setToast({
        tipo: nFallas > 0 ? 'info' : 'ok',
        titulo: nFallas > 0 ? `Registrada con ${nFallas} falla(s)` : 'Inspección aprobada',
        mensaje: `Próximo vencimiento: ${fechaCorta(r.proximo_vencimiento)}.${r.rechazado ? ' Extintor RECHAZADO por falla crítica.' : ''}`,
      })
      setResp({})
      setRespondido({})
      setObs('')
      setFoto(null)
      setGps(null)
      setGpsEstado('idle')
      setIntentosSubmit(0)
      setHistRefresh((n) => n + 1)
      try {
        const e = await api.get<ExtDto>(`/extinguishers/${encodeURIComponent(tag)}`)
        setExt(e)
        void cachePut(tag, e as unknown as import('../../lib/types').Extinguisher).catch(() => undefined)
      } catch {
        /* la ficha ya muestra datos previos */
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 0) {
        await guardarEnCola(payload)
      } else {
        setToast({ tipo: 'err', titulo: 'No se pudo guardar', mensaje: msgError(err) })
      }
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-screen-sm flex-col gap-4 md:max-w-screen-md lg:max-w-4xl" aria-labelledby="titulo-inspeccion">
      <h1 id="titulo-inspeccion" className="text-xl font-semibold">
        Inspección — <span className="font-mono text-primary">{tag || '(sin tag)'}</span>
      </h1>

      {toast && <Toast data={toast} onClose={() => setToast(null)} />}

      {!online && (
        <p
          role="status"
          className="flex min-h-14 items-center gap-2 rounded-xl border-2 border-warn bg-warn/10 px-4 font-semibold text-warn"
        >
          <OfflineIcon size={22} />
          Sin conexión — puedes inspeccionar y el guardado quedará en cola.
        </p>
      )}
      {guardadoLocal && (
        <p
          data-testid="banner-cola"
          role="status"
          className="flex min-h-14 items-center gap-2 rounded-xl border-2 border-info bg-info/10 px-4 font-semibold text-info"
        >
          <ClipboardIcon size={22} />
          Guardado local, se sincronizará al recuperar conexión{pendientes != null ? ` (en cola: ${pendientes})` : ''}.
        </p>
      )}
      {desdeCache && (
        <p role="status" className="flex items-center gap-2 rounded-lg border border-warn bg-warn/10 px-3 py-2 text-sm font-medium text-warn">
          <AlertIcon size={18} /> Ficha mostrada desde caché local (sin conexión).
        </p>
      )}

      {cargando && (
        <p role="status" className="flex items-center gap-2 text-text2" data-testid="cargando-form">
          <ScanIcon size={20} className="animate-pulse" />
          Cargando extintor y checklist…
        </p>
      )}

      {!cargando && errorCarga && !ext && (
        <div className="rounded-xl border-2 border-err bg-err/10 p-4" role="alert">
          <p className="font-semibold text-err">No se pudo cargar la ficha: {errorCarga}</p>
          <button
            type="button"
            onClick={() => void cargar()}
            className="mt-3 flex min-h-14 items-center gap-2 rounded-lg border-2 border-err px-4 font-semibold text-err"
          >
            <GearIcon size={20} />
            Reintentar
          </button>
        </div>
      )}

      {!cargando && ext && (
        <>
          <header className="rounded-xl border border-border bg-surface p-4" aria-label={`Ficha del extintor ${ext.tag}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p data-testid="ficha-tag" className="font-mono text-lg font-bold">{ext.tag}</p>
              <StatusBadge estado={ext.estadoCalculado} />
            </div>
            <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div className="flex justify-between gap-2 border-b border-border py-1">
                <dt className="text-text2">Ubicación</dt>
                <dd data-testid="ficha-ubicacion" className="text-right font-medium">{ext.ubicacion}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border py-1">
                <dt className="text-text2">Tipo</dt>
                <dd className="text-right font-medium">
                  {ext.tipo}
                  {ext.capacidad_l != null ? ` · ${ext.capacidad_l} L` : ''}
                </dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border py-1">
                <dt className="text-text2">Última inspección</dt>
                <dd data-testid="ficha-ultima" className="text-right font-medium">{fechaCorta(ext.ultima_inspeccion)}</dd>
              </div>
              <div className="flex justify-between gap-2 border-b border-border py-1">
                <dt className="text-text2">Próximo vencimiento</dt>
                <dd className="text-right font-medium">{fechaCorta(ext.proximo_vencimiento)}</dd>
              </div>
            </dl>
          </header>

          <form onSubmit={onGuardar} className="mx-auto flex w-full max-w-2xl flex-col gap-4 lg:max-w-3xl">
            <h2 className="text-lg font-semibold">Checklist de inspección</h2>
            <ul className="grid gap-3 lg:grid-cols-2" aria-label="Ítems del checklist">
              {items.map((i) => (
                <CheckItem
                  key={i.id}
                  clave={i.clave}
                  etiqueta={i.etiqueta}
                  critico={CRITICAS.has(i.clave)}
                  valor={respondido[i.clave] ? resp[i.clave] : undefined}
                  mostrarError={intentosSubmit > 0}
                  onChange={(v) => responder(i.clave, v)}
                />
              ))}
            </ul>
            {intentosSubmit > 0 && sinResponder.length > 0 && (
              <p role="alert" className="rounded-lg border border-err bg-err/10 px-3 py-2 text-sm font-semibold text-err">
                Faltan {sinResponder.length} respuesta(s): responde todos los ítems con Pasa o Falla.
              </p>
            )}

            {hayFallas && (
              <section
                data-testid="bloque-no-conformidad"
                aria-labelledby="titulo-no-conformidad"
                className="flex flex-col gap-3 rounded-xl border-2 border-err bg-surface p-4"
              >
                <h3 id="titulo-no-conformidad" className="flex items-center gap-2 text-lg font-semibold text-err">
                  <AlertIcon size={22} />
                  No conformidad — {fallas.length} ítem(s) en falla
                </h3>
                <ul className="list-disc pl-6 text-sm text-text2">
                  {fallas.map((f) => (
                    <li key={f.clave}>{f.etiqueta}</li>
                  ))}
                </ul>

                <div>
                  <p className="mb-2 font-medium">Foto de evidencia (opcional)</p>
                  <input
                    ref={inputFotoRef}
                    data-testid="foto-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="sr-only"
                    aria-label="Capturar o elegir foto de evidencia"
                    onChange={(e) => {
                      const f = e.target.files?.[0]
                      e.target.value = ''
                      void onFoto(f)
                    }}
                  />
                  {foto ? (
                    <div className="flex items-center gap-3 rounded-lg border border-border bg-bg p-2">
                      <img src={foto.dataUrl} alt="Vista previa de la foto de evidencia" data-testid="foto-preview" className="h-24 w-24 rounded object-cover" />
                      <button
                        type="button"
                        onClick={() => setFoto(null)}
                        className="flex min-h-14 items-center gap-2 rounded-lg border-2 border-err px-3 font-semibold text-err"
                      >
                        <CloseIcon size={18} />
                        Quitar foto
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={fotoBusy}
                      aria-busy={fotoBusy}
                      onClick={() => inputFotoRef.current?.click()}
                      className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-border px-4 font-semibold text-text2 hover:border-primary hover:text-primary"
                    >
                      <CameraBtn />
                      {fotoBusy ? 'Comprimiendo foto…' : 'Capturar / elegir foto'}
                    </button>
                  )}
                  {fotoError && (
                    <p role="alert" className="mt-2 text-sm font-medium text-err">
                      {fotoError}
                    </p>
                  )}
                </div>

                <div>
                  <label htmlFor="observaciones" className="mb-2 block font-medium">
                    Observaciones (opcional)
                  </label>
                  <textarea
                    id="observaciones"
                    data-testid="observaciones"
                    rows={3}
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    placeholder="Describe la falla observada…"
                    className="w-full rounded-lg border border-border bg-bg p-3 text-base"
                  />
                </div>
              </section>
            )}

            <div className="rounded-xl border border-border bg-surface p-4">
              <p className="mb-2 font-medium">Ubicación GPS del extintor (opcional)</p>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="gps-btn"
                  disabled={gpsEstado === 'busy'}
                  aria-busy={gpsEstado === 'busy'}
                  onClick={capturarGps}
                  className={`flex min-h-14 items-center gap-2 rounded-lg border-2 px-4 font-semibold ${
                    gps ? 'border-ok bg-ok/10 text-ok' : 'border-primary bg-primary/10 text-primary'
                  } disabled:opacity-60`}
                >
                  <MapPinIcon />
                  {gpsEstado === 'busy' ? 'Obteniendo señal…' : gps ? 'Actualizar ubicación' : 'Usar ubicación'}
                </button>
                {gps && (
                  <p data-testid="gps-lectura" role="status" className="text-sm text-text">
                    <CheckIcon size={16} className="inline text-ok" /> GPS: {gps.lat.toFixed(5)}, {gps.lng.toFixed(5)}
                    {gps.precision ? ` (±${Math.round(gps.precision)} m)` : ''}
                  </p>
                )}
                {gps &&
                  (() => {
                    const coincidencia = verificarCoincidenciaGps(gps, ext)
                    if (!coincidencia) return null
                    return (
                      <p
                        data-testid="gps-coincidencia"
                        role="status"
                        className={`text-sm font-medium ${coincidencia.coincidente ? 'text-ok' : 'text-warn'}`}
                      >
                        {coincidencia.coincidente ? <CheckIcon size={16} className="inline" /> : <AlertIcon size={16} className="inline" />}{' '}
                        {coincidencia.etiqueta}
                      </p>
                    )
                  })()}
                {gpsEstado === 'err' && (
                  <p role="alert" className="text-sm font-medium text-warn">
                    {gpsMsg}
                  </p>
                )}
              </div>
            </div>

            <button
              type="submit"
              data-testid="guardar-inspeccion"
              disabled={enviando || items.length === 0}
              aria-busy={enviando}
              className="flex min-h-16 w-full items-center justify-center gap-3 rounded-xl bg-primary text-lg font-bold text-on-primary disabled:opacity-60"
            >
              {enviando ? (
                <>
                  <ScanIcon size={24} className="animate-pulse" />
                  Guardando…
                </>
              ) : (
                <>
                  <ClipboardIcon size={24} />
                  GUARDAR INSPECCIÓN
                </>
              )}
            </button>
          </form>

          <section aria-labelledby="titulo-historial" className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4">
            <h2 id="titulo-historial" className="text-lg font-semibold">
              Historial — últimas 5 inspecciones de {tag}
            </h2>
            {historial == null ? (
              <p role="status" className="text-sm text-text2">
                {online ? 'Cargando historial…' : 'Historial no disponible sin conexión.'}
              </p>
            ) : historial.length === 0 ? (
              <p className="text-sm text-text2">Sin inspecciones registradas todavía.</p>
            ) : (
              <ul className="flex flex-col gap-2" data-testid="historial">
                {historial.map((h) => (
                  <li
                    key={h.id}
                    className="flex min-h-14 flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-bg px-3 py-2"
                  >
                    <span className="flex items-center gap-2">
                      {h.fallas.length > 0 ? (
                        <CloseIcon size={18} className="text-err" />
                      ) : (
                        <CheckIcon size={18} className="text-ok" />
                      )}
                      <span className="font-medium">{fechaHora(h.created_at)}</span>
                      <span className="text-sm text-text2">· {h.inspector_username}</span>
                      {h.tiene_foto && <span className="rounded bg-info/15 px-2 py-0.5 text-xs font-semibold text-info">foto</span>}
                    </span>
                    <span
                      className={`rounded-full border-2 px-3 py-1 text-xs font-bold uppercase ${
                        h.fallas.length > 0 ? 'border-err text-err bg-err/10' : 'border-ok text-ok bg-ok/10'
                      }`}
                    >
                      {h.fallas.length > 0 ? `Falla (${h.fallas.length})` : 'Pasa'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </section>
  )
}

function CameraBtn() {
  return <CameraIcon size={20} />
}

function MapPinIcon() {
  return <LocationIcon size={20} />
}
