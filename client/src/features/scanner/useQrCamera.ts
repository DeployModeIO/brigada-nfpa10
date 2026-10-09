/**
 * Cámara QR: getUserMedia(environment) + decodificación jsQR en un rAF con throttle.
 * Se apaga al desmontar o al desactivar la pestaña; siempre libera los tracks.
 *
 * En el APK Capacitor se PREFIERE el escáner nativo (@capacitor/barcode-scanner); si el
 * plugin no está disponible, el usuario cancela o no detecta código, se cae al camino
 * web existente (getUserMedia + jsQR) sin cambios. En web es un no-op (esNativo=false).
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import jsQR from 'jsqr'
import { esNativo, escanearNativo } from '../../lib/nativo'

export type EstadoCam = 'inactivo' | 'iniciando' | 'activo' | 'denegado' | 'sin_camara' | 'error'

interface CapTorch extends MediaTrackCapabilities {
  torch?: boolean
}

export interface CamaraResult {
  videoRef: { current: HTMLVideoElement | null }
  estado: EstadoCam
  errorTexto: string | null
  linterna: boolean
  puedeLinterna: boolean
  alternarLinterna: () => void
  reiniciar: () => void
}

export function useQrCamera(activo: boolean, onCodigo: (texto: string) => void): CamaraResult {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const onCodigoRef = useRef(onCodigo)
  onCodigoRef.current = onCodigo

  const [estado, setEstado] = useState<EstadoCam>('inactivo')
  const [errorTexto, setErrorTexto] = useState<string | null>(null)
  const [linterna, setLinterna] = useState(false)
  const [puedeLinterna, setPuedeLinterna] = useState(false)
  const [reinicio, setReinicio] = useState(0)
  const trackRef = useRef<MediaStreamTrack | null>(null)

  const alternarLinterna = useCallback(() => {
    const t = trackRef.current
    if (!t) return
    const siguiente = !linterna
    const apply = (t as MediaStreamTrack & { applyConstraints?: (c: unknown) => Promise<void> }).applyConstraints
    if (!apply) return
    apply
      .call(t, { advanced: [{ torch: siguiente }] })
      .then(() => setLinterna(siguiente))
      .catch(() => setLinterna(!siguiente))
  }, [linterna])

  useEffect(() => {
    if (!activo) {
      setEstado((prev) => (prev === 'inactivo' ? prev : 'inactivo'))
      return
    }
    let vivo = true
    let raf = 0
    let stream: MediaStream | null = null
    let ultimoDecode = 0
    let pausaHasta = 0
    const canvas = document.createElement('canvas')

    setEstado('iniciando')
    setErrorTexto(null)
    setLinterna(false)
    setPuedeLinterna(false)

    const limpiar = () => {
      vivo = false
      cancelAnimationFrame(raf)
      if (stream) stream.getTracks().forEach((t) => t.stop())
      trackRef.current = null
      const v = videoRef.current
      if (v) v.srcObject = null
    }

    const escanear = (ts: number) => {
      if (!vivo) return
      raf = requestAnimationFrame(escanear)
      const v = videoRef.current
      if (!v || v.readyState < 2 || !v.videoWidth) return
      if (ts < pausaHasta || ts - ultimoDecode < 90) return
      ultimoDecode = ts
      const escala = Math.min(1, 480 / v.videoWidth)
      const w = Math.max(1, Math.round(v.videoWidth * escala))
      const h = Math.max(1, Math.round(v.videoHeight * escala))
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(v, 0, 0, w, h)
      const img = ctx.getImageData(0, 0, w, h)
      const res = jsQR(img.data, w, h, { inversionAttempts: 'dontInvert' })
      if (res && res.data) {
        pausaHasta = ts + 1600
        onCodigoRef.current(res.data)
      }
    }

    // Camino WEB original (getUserMedia + jsQR). Extraído a función para que el intento
    // nativo pueda caer aquí sin duplicar lógica ni alterar su comportamiento.
    const arrancarWeb = () => {
      const md: MediaDevices | undefined = navigator.mediaDevices
      if (!md || typeof md.getUserMedia !== 'function') {
        setEstado('sin_camara')
        setErrorTexto('Este navegador no expone getUserMedia.')
        return
      }
      md.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      })
        .then((s) => {
          if (!vivo) {
            s.getTracks().forEach((t) => t.stop())
            return
          }
          stream = s
          const v = videoRef.current
          if (!v) {
            limpiar()
            setEstado('error')
            setErrorTexto('El visor de cámara no está montado.')
            return
          }
          v.srcObject = s
          trackRef.current = s.getVideoTracks()[0] ?? null
          const caps = trackRef.current?.getCapabilities?.() as CapTorch | undefined
          setPuedeLinterna(Boolean(caps && caps.torch))
          const arranco = () => {
            if (!vivo) return
            void v.play().catch(() => undefined)
            setEstado('activo')
            raf = requestAnimationFrame(escanear)
          }
          if (v.readyState >= 2) arranco()
          else v.addEventListener('loadeddata', arranco, { once: true })
        })
        .catch((e: unknown) => {
          if (!vivo) return
          const name = e instanceof DOMException ? e.name : ''
          if (name === 'NotAllowedError' || name === 'SecurityError') setEstado('denegado')
          else if (name === 'NotFoundError' || name === 'NotReadableError' || name === 'OverconstrainedError')
            setEstado('sin_camara')
          else {
            setEstado('error')
            setErrorTexto(e instanceof Error ? e.message : String(e))
          }
        })
    }

    // Preferencia NATIVA: escáner del sistema si corremos en APK; si no hay plugin,
    // se cancela o no detecta nada → cae a la cámara web/jsQR de siempre.
    void (async () => {
      if (await esNativo()) {
        const texto = await escanearNativo()
        if (!vivo) return
        if (texto) {
          onCodigoRef.current(texto)
          setEstado('activo')
          return
        }
      }
      if (vivo) arrancarWeb()
    })()

    return limpiar
  }, [activo, reinicio])

  return { videoRef, estado, errorTexto, linterna, puedeLinterna, alternarLinterna, reiniciar: () => setReinicio((n) => n + 1) }
}