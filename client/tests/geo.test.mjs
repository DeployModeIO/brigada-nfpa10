import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const raiz = fileURLToPath(new URL('..', import.meta.url))

test('geo.ts presente con haversine, umbral y verificación de coincidencia', async () => {
  const { distanciaMetros, verificarCoincidenciaGps, UMBRAL_COINCIDENCIA_M } = await import(
    './.build/geo.mjs'
  )
  assert.equal(UMBRAL_COINCIDENCIA_M, 100, 'umbral de coincidencia 100 m')

  // Misma coordenada ⇒ distancia 0
  assert.equal(distanciaMetros({ lat: -0.18, lng: -78.47 }, { lat: -0.18, lng: -78.47 }), 0)

  // Caso real Oil & Gas: Planta Compresora → Muelle de Carguío (Ecuador, ~tens de km)
  const planta = { lat: -0.95, lng: -80.7 }
  const muelle = { lat: -0.96, lng: -80.69 }
  const d = distanciaMetros(planta, muelle)
  assert.ok(d > 1000 && d < 3000, `distancia planta→muelle fuera de rango: ${d} m`)

  // Coincidencia: GPS de campo a 30 m del registro ⇒ coincidente
  const registro = { lat: -0.95, lng: -80.7 }
  const campoCerca = { lat: -0.95013, lng: -80.7 } // ~14 m al norte
  const cerca = verificarCoincidenciaGps(campoCerca, registro)
  assert.ok(cerca && cerca.coincidente, 'a 14 m debe coincidir')

  // Desviación: GPS a ~2 km ⇒ no coincidente + etiqueta de advertencia
  const campoLejos = { lat: -0.96, lng: -80.7 }
  const lejos = verificarCoincidenciaGps(campoLejos, registro)
  assert.ok(lejos && !lejos.coincidente)
  assert.match(lejos.etiqueta, /Desviación/)
})

test('verificarCoincidenciaGps sin coordenadas registradas ⇒ null (no bloquea)', async () => {
  const { verificarCoincidenciaGps } = await import('./.build/geo.mjs')
  assert.equal(verificarCoincidenciaGps({ lat: 0, lng: 0 }, null), null)
  assert.equal(verificarCoincidenciaGps({ lat: 0, lng: 0 }, { lat: NaN, lng: 5 }), null)
})

test('InspectionFormPage consume la verificación GPS (data-testid gps-coincidencia)', () => {
  const src = readFileSync(`${raiz}src/features/inspection/InspectionFormPage.tsx`, 'utf8')
  assert.ok(src.includes("data-testid=\"gps-coincidencia\""), 'falta marcador de coincidencia GPS')
  assert.ok(src.includes('verificarCoincidenciaGps'), 'falta import/uso de verificarCoincidenciaGps')
})
