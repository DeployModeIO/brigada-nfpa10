/**
 * MapaReal — mapa geográfico REAL del cliente en /planta.
 *
 * Decisión docs/adr/ADR-001 §Mapas: mapa embebido a COSTE CERO con Leaflet + tiles de
 * OpenStreetMap, más un deep-link "Abrir en Google Maps" al dispositivo. NO se usa la API
 * JS de Google Maps (exigiría clave y facturación). Solo se pintan equipos con lat/lng
 * finitos; los que no tienen coordenadas quedan en el plano SVG y la búsqueda.
 *
 * Se cargan los estilos propios de Leaflet (CSS local empaquetado por Vite, sin CDN) y se
 * evitan por completo los iconos-marcador por defecto (assets) usando circleMarker.
 */
import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { obtenerUbicacion } from '../../lib/nativo'
import { colorDe } from './pins'
import { escaparHtml, etiquetaEstado, mapsUrlPara, type PuntoGeo } from './mapaGeo'

const OSM_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png'
const OSM_ATRIBUIR =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

/** Planta por defecto (Quito, según fixtures del maestro) si no hay equipos con coordenadas. */
const CENTRO_POR_DEFECTO: L.LatLngExpression = [-0.18, -78.46]
const ZOOM_POR_DEFECTO = 16

interface Props {
  /** Equipos ya filtrados que SÍ se pueden pintar (coordenadas válidas). */
  puntos: PuntoGeo[]
  /** Al tocar "Ver ficha" en el popup: abre la inspección del equipo. */
  onAbrirFicha?: (tag: string) => void
  /** aria-label del contenedor del mapa. */
  etiqueta?: string
}

/** Lee un token semántico del tema activo (los marcadores de Leaflet no aceptan var()). */
function tokenCss(nombre: string): string {
  if (typeof document === 'undefined') return nombre
  return getComputedStyle(document.documentElement).getPropertyValue(nombre).trim() || nombre
}

/** colorDe() devuelve `var(--x)`; Leaflet necesita el color resuelto del tema. */
function colorMapa(estado: string): string {
  const v = colorDe(estado)
  const m = /^var\((--[\w-]+)\)$/.exec(v)
  return m ? tokenCss(m[1]) : v
}

/** Traduce los errores de geolocalización del navegador (códigos 1/2/3) a español. */
function mensajeGeo(e: unknown): string {
  if (e instanceof Error) {
    const code = (e as Error & { code?: unknown }).code
    if (code === 1) return 'Permiso de ubicación denegado'
    if (code === 2) return 'Ubicación no disponible'
    if (code === 3) return 'Tiempo de espera agotado'
    return e.message
  }
  return 'No se pudo obtener la ubicación del dispositivo.'
}

export default function MapaReal({ puntos, onAbrirFicha, etiqueta }: Props) {
  const divRef = useRef<HTMLDivElement | null>(null)
  const mapaRef = useRef<L.Map | null>(null)
  const capaEquipos = useRef<L.LayerGroup | null>(null)
  const capaMiUbic = useRef<L.LayerGroup | null>(null)
  const fichaRef = useRef(onAbrirFicha)
  fichaRef.current = onAbrirFicha

  const [aviso, setAviso] = useState<string | null>(null)
  const [ubicando, setUbicando] = useState(false)

  // Inicializa el mapa una sola vez y lo destruye al desmontar (map.remove()).
  useEffect(() => {
    const div = divRef.current
    if (!div || mapaRef.current) return
    const map = L.map(div, { center: CENTRO_POR_DEFECTO, zoom: ZOOM_POR_DEFECTO })
    L.tileLayer(OSM_URL, { maxZoom: 19, attribution: OSM_ATRIBUIR }).addTo(map)
    capaEquipos.current = L.layerGroup().addTo(map)
    capaMiUbic.current = L.layerGroup().addTo(map)
    mapaRef.current = map
    return () => {
      map.remove()
      mapaRef.current = null
      capaEquipos.current = null
      capaMiUbic.current = null
    }
  }, [])

  // Repinta los equipos al cambiar el filtro y ajusta la vista a sus límites.
  useEffect(() => {
    const map = mapaRef.current
    const capa = capaEquipos.current
    if (!map || !capa) return
    capa.clearLayers()
    const marcadores: L.CircleMarker[] = []
    for (const p of puntos) {
      const marcador = L.circleMarker([p.lat, p.lng], {
        radius: 8,
        color: tokenCss('--surface'),
        weight: 2,
        fillColor: colorMapa(p.estado),
        fillOpacity: 0.92,
      })
      const cont = document.createElement('div')
      cont.innerHTML =
        `<strong>${escaparHtml(p.tag)}</strong><br>` +
        `<span>${escaparHtml(p.ubicacion || 'Sin ubicación')}</span><br>` +
        `<span>Estado: ${escaparHtml(etiquetaEstado(p.estado))}</span><br>` +
        `<a href="${mapsUrlPara(p.lat, p.lng)}" target="_blank" rel="noopener noreferrer">Abrir en Google Maps</a>`
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.textContent = 'Ver ficha'
      btn.style.cssText =
        'margin-top:4px;padding:0;border:none;background:transparent;cursor:pointer;' +
        'font:inherit;text-decoration:underline;color:var(--primary)'
      btn.addEventListener('click', () => fichaRef.current?.(p.tag))
      cont.appendChild(document.createElement('br'))
      cont.appendChild(btn)
      marcador.bindPopup(cont)
      marcador.addTo(capa)
      marcadores.push(marcador)
    }
    if (marcadores.length) {
      map.fitBounds(L.latLngBounds(marcadores.map((m) => m.getLatLng())), { padding: [30, 30], maxZoom: 18 })
    } else {
      map.setView(CENTRO_POR_DEFECTO, ZOOM_POR_DEFECTO)
    }
  }, [puntos])

  // "Mi ubicación": usa el helper nativo/web existente y centra el mapa en el dispositivo.
  async function centrarEnMi() {
    setAviso(null)
    setUbicando(true)
    try {
      const u = await obtenerUbicacion()
      const map = mapaRef.current
      const capa = capaMiUbic.current
      if (!map || !capa) return
      capa.clearLayers()
      const color = tokenCss('--info')
      const halo = u.precision > 0 ? u.precision : 25
      L.circle([u.lat, u.lng], {
        radius: halo,
        color,
        weight: 1,
        fillColor: color,
        fillOpacity: 0.12,
      }).addTo(capa)
      L.circleMarker([u.lat, u.lng], {
        radius: 9,
        color: tokenCss('--surface'),
        weight: 3,
        fillColor: color,
        fillOpacity: 1,
      })
        .bindPopup(`<strong>Mi ubicación</strong><br>Precisión ±${Math.round(halo)} m`)
        .addTo(capa)
      map.setView([u.lat, u.lng], 17)
    } catch (e) {
      setAviso(mensajeGeo(e))
    } finally {
      setUbicando(false)
    }
  }

  return (
    <div className="relative">
      <div
        ref={divRef}
        role="region"
        aria-label={etiqueta || `Mapa real con ${puntos.length} equipos`}
        data-testid="mapa-real"
        className="h-[62vh] w-full overflow-hidden rounded-xl border border-border lg:h-[74vh]"
      />
      <div className="absolute right-2 top-2 z-[1000] flex flex-col items-end gap-1">
        <button
          type="button"
          onClick={centrarEnMi}
          disabled={ubicando}
          aria-label="Centrar el mapa en mi ubicación"
          className="min-h-10 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-text shadow disabled:opacity-60"
        >
          {ubicando ? 'Ubicando…' : 'Mi ubicación'}
        </button>
        {aviso && (
          <p role="alert" className="max-w-[16rem] rounded-lg border border-err/60 bg-surface p-2 text-xs text-err shadow">
            {aviso}
          </p>
        )}
      </div>
    </div>
  )
}