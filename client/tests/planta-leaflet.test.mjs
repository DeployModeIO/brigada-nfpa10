import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))
const leer = (p) => readFileSync(`${raiz}${p}`, 'utf8')

test('mapa geográfico opt-in: Leaflet con URL dinámica (sin hardcodear, Criterio 16)', () => {
  const comp = leer('src/features/planta/PlantaLeaflet.tsx')
  assert.ok(comp.includes("from 'leaflet'"), 'importa leaflet')
  assert.ok(comp.includes('tileUrl'), 'usa tileUrl como prop dinámica')
  assert.ok(!comp.includes('tile.openstreetmap.org'), 'NO hardcodea la URL de OSM (Criterio 16)')
  assert.ok(comp.includes('navigator.geolocation'), 'usa el GPS del dispositivo (Mi ubicación)')
  assert.ok(comp.includes('data-testid="mi-ubicacion"'), 'botón mi ubicación presente')

  const pagina = leer('src/features/planta/PlantaPage.tsx')
  assert.ok(pagina.includes('<PlantaLeaflet'), 'PlantaPage renderiza el mapa cuando hay tileUrl')
  assert.ok(pagina.includes('config.mapTileUrl'), 'la URL sale de la configuración del servidor')
})

test('servidor expone mapTileUrl en public-config con default OSM', () => {
  const pub = leer('..\\server\\src\\routes\\public.js')
  assert.ok(pub.includes('mapTileUrl'), 'public-config incluye mapTileUrl')
  const set = leer('..\\server\\src\\routes\\settings.js')
  assert.ok(set.includes('tile.openstreetmap.org'), 'el default vive en el SERVIDOR (no en el cliente)')
  assert.ok(set.includes('mapTileUrl'), 'settings soporta mapTileUrl')
})
