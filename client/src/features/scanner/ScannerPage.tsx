/**
 * /escanear — lector QR por cámara (getUserMedia + jsQR en rAF), con linterna si el
 * dispositivo la expone, fallback por imagen (jsQR sobre canvas) y búsqueda rápida por
 * tag (/extinguishers?q= + caché IndexedDB). BONUS: pestaña generador de etiquetas QR.
 */
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import jsQR from 'jsqr'
import { api } from '../../lib/api'
import { cacheAllExtintores } from '../../lib/offline'
import { ScanIcon, SearchIcon } from '../../components/icons'
import StatusBadge from '../inspection/StatusBadge'
import { extraerTag, esTagValido } from './tagUtils'
import { useQrCamera } from './useQrCamera'
import { QrGenerator } from './QrGenerator'
import { CameraIcon, FlashlightIcon, QrIcon, SoundOffIcon, SoundOnIcon, UploadIcon } from './icons'
import type { ExtDto, Pag } from '../inspection/apiTypes'

type Pestaña = 'escaner' | 'generador'
const BEEP_KEY = 'nfpa_beep'

function sonar() {
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!AC) return
    const ctx = new AC()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.0001, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.18)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.2)
    osc.onended = () => void ctx.close().catch(() => undefined)
  } catch {
    /* audio no disponible: el escaneo sigue funcionando */
  }
}

export default function ScannerPage() {
  const navigate = useNavigate()
  const [pestana, setPestana] = useState<Pestaña>('escaner')
  const [beep, setBeep] = useState<boolean>(() => {
    try {
      return localStorage.getItem(BEEP_KEY) !== 'off'
    } catch {
      return true
    }
  })
  const [mensaje, setMensaje] = useState<string | null>(null)

  const alternarBeep = () => {
    setBeep((prev) => {
      const next = !prev
      try {
        localStorage.setItem(BEEP_KEY, next ? 'on' : 'off')
      } catch {
        /* sin persistencia posible */
      }
      return next
    })
  }

  const alDecodificar = useCallback(
    (texto: string) => {
      const tag = extraerTag(texto)
      if (!tag) {
        setMensaje('Código QR no reconocido: la etiqueta debe contener el tag del extintor.')
        return
      }
      if (beep) sonar()
      setMensaje(`Etiqueta ${tag} detectada — abriendo inspección…`)
      navigate(`/inspeccion/${encodeURIComponent(tag)}`)
    },
    [beep, navigate],
  )

  const cam = useQrCamera(pestana === 'escaner', alDecodificar)

  /* ---------- fallback 1: subir imagen QR ---------- */
  const inputImagenRef = useRef<HTMLInputElement | null>(null)
  const [procesandoImg, setProcesandoImg] = useState(false)

  const decodificarImagen = async (file: File) => {
    setProcesandoImg(true)
    setMensaje(null)
    try {
      const bitmap = await createImageBitmap(file)
      const escala = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height))
      const w = Math.max(1, Math.round(bitmap.width * escala))
      const h = Math.max(1, Math.round(bitmap.height * escala))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) throw new Error('Canvas no disponible.')
      ctx.drawImage(bitmap, 0, 0, w, h)
      const data = ctx.getImageData(0, 0, w, h)
      bitmap.close()
      const res = jsQR(data.data, w, h)
      if (!res || !res.data) {
        setMensaje('No se encontró un QR legible en la imagen. Prueba con otra foto o usa la búsqueda.')
        return
      }
      alDecodificar(res.data)
    } catch (e) {
      setMensaje(e instanceof Error ? e.message : 'No se pudo procesar la imagen.')
    } finally {
      setProcesandoImg(false)
    }
  }

  /* ---------- fallback 2: búsqueda rápida por tag ---------- */
  const [q, setQ] = useState('')
  const [buscando, setBuscando] = useState(false)
  const [resultados, setResultados] = useState<ExtDto[] | null>(null)
  const [desdeCache, setDesdeCache] = useState(false)
  const [errorBusqueda, setErrorBusqueda] = useState<string | null>(null)

  const buscar = async (ev?: FormEvent) => {
    ev?.preventDefault()
    const texto = q.trim()
    if (!texto) return
    setBuscando(true)
    setErrorBusqueda(null)
    setResultados(null)
    setDesdeCache(false)
    try {
      const r = await api.get<Pag<ExtDto>>(`/extinguishers?q=${encodeURIComponent(texto)}&size=10`)
      setResultados(r.items)
    } catch {
      const needle = texto.toLowerCase()
      const cached = (await cacheAllExtintores().catch(() => [])) as unknown as ExtDto[]
      const filtrado = cached.filter(
        (x) => x.tag.toLowerCase().includes(needle) || (x.ubicacion || '').toLowerCase().includes(needle),
      )
      setResultados(filtrado)
      setDesdeCache(true)
      if (cached.length === 0) setErrorBusqueda('Sin conexión y sin coincidencias en caché.')
    } finally {
      setBuscando(false)
    }
  }

  const abrir = (tag: string) => navigate(`/inspeccion/${encodeURIComponent(tag.toUpperCase())}`)

  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-escanear">
      <h1 id="titulo-escanear" className="flex items-center gap-2 text-xl font-semibold">
        <ScanIcon size={22} /> Escanear etiqueta QR
      </h1>

      <div role="tablist" aria-label="Herramientas de etiqueta" className="grid grid-cols-2 gap-2">
        <button
          type="button"
          role="tab"
          id="tab-escaner"
          aria-selected={pestana === 'escaner'}
          aria-controls="panel-escaner"
          onClick={() => setPestana('escaner')}
          className={`flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 text-base font-semibold ${
            pestana === 'escaner' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text2'
          }`}
        >
          <CameraIcon size={20} /> Escáner
        </button>
        <button
          type="button"
          role="tab"
          id="tab-generador"
          aria-selected={pestana === 'generador'}
          aria-controls="panel-generador"
          onClick={() => setPestana('generador')}
          className={`flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 text-base font-semibold ${
            pestana === 'generador' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text2'
          }`}
        >
          <QrIcon size={20} /> Generador QR
        </button>
      </div>

      {pestana === 'escaner' && (
        <div role="tabpanel" id="panel-escaner" aria-labelledby="tab-escaner" className="flex flex-col gap-4">
          <div className="relative overflow-hidden rounded-xl border border-border bg-bg2">
            <video
              ref={cam.videoRef}
              data-testid="video-camara"
              muted
              playsInline
              autoPlay
              aria-label="Vista de la cámara para leer el código QR"
              className={`h-[340px] w-full object-cover ${cam.estado === 'activo' ? '' : 'opacity-30'}`}
            />
            {cam.estado === 'activo' && (
              <div aria-hidden className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative h-56 w-56">
                  <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-xl border-l-4 border-t-4 border-ok" />
                  <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-xl border-r-4 border-t-4 border-ok" />
                  <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-xl border-b-4 border-l-4 border-ok" />
                  <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-xl border-b-4 border-r-4 border-ok" />
                </div>
              </div>
            )}
            <p role="status" className="absolute inset-x-0 bottom-0 bg-bg2/80 px-3 py-2 text-center text-sm">
              {cam.estado === 'iniciando' && 'Iniciando cámara…'}
              {cam.estado === 'activo' && 'Apunta al QR de la etiqueta — buscando código…'}
              {cam.estado === 'denegado' && 'Permiso de cámara denegado'}
              {cam.estado === 'sin_camara' && 'Cámara no disponible'}
              {cam.estado === 'error' && (cam.errorTexto ?? 'Error de cámara')}
              {cam.estado === 'inactivo' && ''}
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {cam.puedeLinterna && cam.estado === 'activo' && (
              <button
                type="button"
                onClick={cam.alternarLinterna}
                aria-pressed={cam.linterna}
                className={`flex min-h-14 items-center gap-2 rounded-lg border-2 px-4 font-semibold ${
                  cam.linterna ? 'border-warn bg-warn/15 text-warn' : 'border-border text-text2'
                }`}
              >
                <FlashlightIcon size={20} />
                Linterna {cam.linterna ? 'activada' : 'apagada'}
              </button>
            )}
            <button
              type="button"
              onClick={alternarBeep}
              aria-pressed={beep}
              className={`flex min-h-14 items-center gap-2 rounded-lg border-2 px-4 font-semibold ${
                beep ? 'border-ok bg-ok/10 text-ok' : 'border-border text-text2'
              }`}
            >
              {beep ? <SoundOnIcon size={20} /> : <SoundOffIcon size={20} />}
              Sonido {beep ? 'activo' : 'silenciado'}
            </button>
            {(cam.estado === 'denegado' || cam.estado === 'error') && (
              <button
                type="button"
                onClick={cam.reiniciar}
                className="flex min-h-14 items-center gap-2 rounded-lg border-2 border-primary bg-primary/10 px-4 font-semibold text-primary"
              >
                <CameraIcon size={20} />
                Reintentar cámara
              </button>
            )}
          </div>

          {cam.estado === 'denegado' && (
            <div data-testid="aviso-permiso" className="rounded-xl border-2 border-warn bg-warn/10 p-4">
              <p className="flex items-center gap-2 font-semibold text-warn">
                <FlashlightIcon size={20} /> La cámara necesita tu permiso
              </p>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-text">
                <li>Toca el candado o el icono de cámara en la barra de dirección del navegador.</li>
                <li>Activa «Permitir cámara» para este sitio y recarga la página.</li>
                <li>¿Sin cámara? Usa uno de los dos métodos alternativos de abajo: subir una foto del QR o buscar el tag.</li>
              </ol>
            </div>
          )}
          {cam.estado === 'sin_camara' && (
            <p className="rounded-xl border border-info bg-info/10 p-4 text-sm text-info" role="status">
              Este dispositivo no tiene cámara disponible. Usa la foto del QR o la búsqueda rápida.
            </p>
          )}

          <p role="status" aria-live="polite" data-testid="estado-escaner" className="min-h-6 text-center text-sm font-medium text-text2">
            {mensaje}
          </p>

          <div className="rounded-xl border border-border bg-surface p-4">
            <p className="mb-2 flex items-center gap-2 font-semibold">
              <UploadIcon size={20} /> Sin cámara: sube una foto del QR
            </p>
            <input
              ref={inputImagenRef}
              data-testid="subir-qr-input"
              type="file"
              accept="image/*"
              className="sr-only"
              aria-label="Imagen con un código QR de etiqueta"
              onChange={(e) => {
                const f = e.target.files?.[0]
                e.target.value = ''
                if (f) void decodificarImagen(f)
              }}
            />
            <button
              type="button"
              disabled={procesandoImg}
              onClick={() => inputImagenRef.current?.click()}
              aria-busy={procesandoImg}
              className="flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-primary bg-primary/10 px-4 font-semibold text-primary disabled:opacity-60"
            >
              <UploadIcon size={20} />
              {procesandoImg ? 'Procesando imagen…' : 'Elegir imagen QR'}
            </button>
          </div>

          <form onSubmit={buscar} className="rounded-xl border border-border bg-surface p-4" aria-label="Búsqueda rápida por tag">
            <label htmlFor="busqueda-rapida" className="mb-2 block font-semibold">
              Búsqueda rápida por tag
            </label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                id="busqueda-rapida"
                data-testid="busqueda-rapida"
                type="text"
                inputMode="text"
                autoComplete="off"
                spellCheck={false}
                placeholder="Ej. EXTF-COC-001"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="min-h-14 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 text-base"
              />
              <button
                type="submit"
                disabled={buscando || !q.trim()}
                aria-busy={buscando}
                className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-on-primary disabled:opacity-60"
              >
                <SearchIcon size={20} />
                {buscando ? 'Buscando…' : 'Buscar'}
              </button>
            </div>
            {esTagValido(q) && (
              <button
                type="button"
                data-testid="abrir-directo"
                onClick={() => abrir(q)}
                className="mt-2 flex min-h-14 w-full items-center justify-center gap-2 rounded-lg border-2 border-ok bg-ok/10 px-4 font-semibold text-ok"
              >
                <ScanIcon size={20} />
                Abrir {q.trim().toUpperCase()} directo
              </button>
            )}
            {errorBusqueda && (
              <p role="alert" className="mt-2 text-sm font-medium text-err">
                {errorBusqueda}
              </p>
            )}
            {resultados && resultados.length === 0 && !errorBusqueda && (
              <p className="mt-3 text-sm text-text2" role="status">
                Sin coincidencias para «{q.trim()}».
              </p>
            )}
            {resultados && resultados.length > 0 && (
              <ul className="mt-3 flex flex-col gap-2" aria-label="Resultados de búsqueda">
                {desdeCache && (
                  <li className="text-xs font-semibold text-warn" role="status">
                    Mostrando caché local (sin conexión).
                  </li>
                )}
                {resultados.map((x) => (
                  <li key={x.tag}>
                    <button
                      type="button"
                      data-testid={`res-${x.tag}`}
                      onClick={() => abrir(x.tag)}
                      className="flex min-h-14 w-full items-center justify-between gap-3 rounded-lg border border-border bg-bg px-4 text-left hover:bg-bg2"
                    >
                      <span className="min-w-0">
                        <span className="block font-mono font-semibold">{x.tag}</span>
                        <span className="block truncate text-sm text-text2">
                          {x.ubicacion} · {x.tipo}
                        </span>
                      </span>
                      <StatusBadge estado={x.estadoCalculado} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </form>
        </div>
      )}

      {pestana === 'generador' && (
        <div role="tabpanel" id="panel-generador" aria-labelledby="tab-generador">
          <QrGenerator />
        </div>
      )}
    </section>
  )
}
