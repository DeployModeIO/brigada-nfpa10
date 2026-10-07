/**
 * /planta — mapa geográfico OPCIONAL (Leaflet) para BRIGADA O&G.
 * La URL de baldosas NO está hardcodeada (Criterio 16): llega por `tileUrl`
 * desde la configuración del servidor (settings.mapTileUrl). Si el admin la
 * deja vacía, PlantaPage usa el plano SVG offline en su lugar.
 * Incluye botón "Mi ubicación": usa el GPS del dispositivo (navigator.geolocation)
 * para centrar el mapa y marcar la posición actual del brigadista.
 */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { colorDe } from './pins'
import type { Extinguisher } from '../../lib/types'

interface Props {
  items: Extinguisher[]
  tileUrl: string
  onOpen: (tag: string) => void
}

function puntos(items: Extinguisher[]) {
  return items
    .filter((e) => Number.isFinite(e.lat as number) && Number.isFinite(e.lng as number))
    .map((e) => ({
      tag: e.tag,
      lat: e.lat as number,
      lng: e.lng as number,
      estado: e.estadoCalculado || e.estado_inspeccion || 'sin_inspeccionar',
      ubicacion: e.ubicacion || '',
      agente: e.agente || '',
    }))
}

export default function PlantaLeaflet({ items, tileUrl, onOpen }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const capaRef = useRef<L.LayerGroup | null>(null)
  const [miPosicion, setMiPosicion] = useState<[number, number] | null>(null)
  const [gpsMsg, setGpsMsg] = useState<string | null>(null)

  useEffect(() => {
    if (!ref.current || mapaRef.current) return
    const map = L.map(ref.current, { zoomControl: true }).setView([-0.18, -78.47], 14)
    L.tileLayer(tileUrl, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map)
    capaRef.current = L.layerGroup().addTo(map)
    mapaRef.current = map
    return () => { map.remove(); mapaRef.current = null }
  }, [tileUrl])

  useEffect(() => {
    const capa = capaRef.current
    if (!capa) return
    capa.clearLayers()
    for (const p of puntos(items)) {
      const icono = L.divIcon({
        className: '',
        html: `<span style="display:block;width:16px;height:16px;border-radius:50%;background:${colorDe(p.estado)};border:2px solid #fff;box-shadow:0 0 4px rgba(0,0,0,.5)"></span>`,
        iconSize: [16, 16], iconAnchor: [8, 8],
      })
      L.marker([p.lat, p.lng], { icon: icono, title: `${p.tag} — ${p.ubicacion}` })
        .bindPopup(`<strong>${p.tag}</strong><br/>${p.ubicacion || 'Sin ubicación'}<br/>${p.estado.split('_').join(' ')}`)
        .on('click', () => onOpen(p.tag))
        .addTo(capa)
    }
    if (miPosicion) {
      const yo = L.divIcon({
        className: '',
        html: '<span style="display:block;width:16px;height:16px;border-radius:50%;background:#1a73e8;border:3px solid #fff;box-shadow:0 0 6px #1a73e8"></span>',
        iconSize: [16, 16], iconAnchor: [8, 8],
      })
      L.marker(miPosicion, { icon: yo }).bindPopup('Mi ubicación actual').addTo(capa)
    }
  }, [items, miPosicion, onOpen])

  function centrarEnMi() {
    setGpsMsg(null)
    if (!('geolocation' in navigator)) { setGpsMsg('GPS no disponible en este dispositivo.'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c: [number, number] = [pos.coords.latitude, pos.coords.longitude]
        setMiPosicion(c)
        mapaRef.current?.setView(c, 16)
      },
      () => setGpsMsg('No se pudo obtener tu ubicación (permiso denegado o sin señal).'),
      { enableHighAccuracy: true, timeout: 8000 },
    )
  }

  return (
    <div className="relative">
      <div ref={ref} className="h-[62vh] w-full lg:h-[74vh]" aria-label="Mapa geográfico de extintores" />
      <button
        type="button"
        onClick={centrarEnMi}
        className="absolute right-3 top-3 z-[1000] rounded-lg border border-border bg-surface px-3 py-2 text-sm font-semibold text-primary shadow"
        data-testid="mi-ubicacion"
      >
        📍 Mi ubicación
      </button>
      {gpsMsg && <p role="alert" className="absolute bottom-3 left-3 z-[1000] rounded-lg bg-bg2 px-3 py-2 text-xs text-warn">{gpsMsg}</p>}
    </div>
  )
}
