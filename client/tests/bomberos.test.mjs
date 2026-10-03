/**
 * Criterio 11: informe Bomberos — cobertura por área + firma del jefe (fixture),
 * bytes %PDF y N páginas > 0 (pdfmake local, sin red — patrón de la línea).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const req = createRequire(import.meta.url)
const { coberturasPorArea, docBomberosPdf } = await import('./.build/bomberos.mjs')

const panel = {
  verde: [{ tag: 'A1', ubicacion: 'Nave A (1)', capacidad_l: 6, proximo_vencimiento: null, estado_inspeccion: 'pasa', rechazado: false, estadoCalculado: 'vigente' }],
  amarillo: [],
  rojo: [{ tag: 'A2', ubicacion: 'Nave A (2)', capacidad_l: 6, proximo_vencimiento: null, estado_inspeccion: 'pasa', rechazado: false, estadoCalculado: 'vencido' }],
  negro: [{ tag: 'C1', ubicacion: 'Cocina — freidora', capacidad_l: 6, proximo_vencimiento: null, estado_inspeccion: 'falla', rechazado: true, estadoCalculado: 'rechazado' }],
  cont: { v: 1, g: 0, r: 1, n: 1 },
}
const todos = [
  { tag: 'A1', ubicacion: 'Nave A (1)', metadata: null },
  { tag: 'A2', ubicacion: 'Nave A (2)', metadata: null },
  { tag: 'C1', ubicacion: 'Cocina — freidora', metadata: null },
  { tag: 'N1', ubicacion: 'Nave B nueva', metadata: null },
]

test('coberturasPorArea agrupa y calcula morosidad', () => {
  const cov = coberturasPorArea(panel, todos)
  assert.equal(cov.length, 3)
  const cocina = cov.find((c) => c.area === 'Cocina')
  const naveA = cov.find((c) => c.area === 'Nave A')
  assert.equal(cocina.rechazado, 1)
  assert.equal(naveA.total, 2)
  assert.equal(naveA.morosidadPct, 50, '1 vencido de 2 con inspección = 50 %')
  assert.ok(cov[0].area === 'Cocina', 'áreas con rechazos abiertos primero')
})

test('docBomberosPdf: cobertura, firmas inspector/jefe y QR opcional', () => {
  const dd = docBomberosPdf({
    appName: 'Brigada NFPA 10',
    periodo: 'septiembre de 2026',
    generado: '03/10/2026 15:00',
    coberturas: coberturasPorArea(panel, todos),
    rechazosAbiertos: [{ tag: 'C1', ubicacion: 'Cocina — freidora', motivo: 'manómetro fuera de rango' }],
    inspectorNombre: 'Inspector de Brigada (demo)',
    jefeBrigadaNombre: 'Jefa de Brigada Demo',
    qrDataUrl: null,
  })
  const txt = JSON.stringify(dd)
  assert.match(txt, /Cobertura por área/)
  assert.match(txt, /Jefa de Brigada Demo/)
  assert.match(txt, /Bomberos de Chile/)
  assert.equal(dd.pageSize, 'A4')
})

test('Criterio 11: render pdfmake local → bytes %PDF y páginas > 0', async () => {
  const pdfMakeMod = req('pdfmake/build/pdfmake.js')
  const vfs = req('pdfmake/build/vfs_fonts.js')
  const PM = pdfMakeMod.pdfMake ?? pdfMakeMod
  if (!PM.vfs || Object.keys(PM.vfs).length === 0) {
    if (typeof PM.addVirtualFileSystem === 'function') PM.addVirtualFileSystem(vfs.pdfMake ? vfs.pdfMake.vfs : vfs.vfs ?? vfs)
    else PM.vfs = vfs.pdfMake ? vfs.pdfMake.vfs : vfs.vfs ?? vfs
  }
  const dd = docBomberosPdf({
    appName: 'Brigada NFPA 10',
    periodo: 'septiembre de 2026',
    generado: '03/10/2026 15:00',
    coberturas: coberturasPorArea(panel, todos),
    rechazosAbiertos: [{ tag: 'C1', ubicacion: 'Cocina — freidora', motivo: 'manómetro fuera de rango' }],
    inspectorNombre: 'Inspector de Brigada (demo)',
    jefeBrigadaNombre: 'Jefa de Brigada Demo',
  })
  const doc = PM.createPdfDocument ? PM.createPdfDocument(dd) : PM.createPdf(dd)
  const blob = await new Promise((resolve, reject) => {
    try { doc.getBlob((b) => resolve(b)) } catch (e) { reject(e) }
  })
  const buf = Buffer.from(await blob.arrayBuffer())
  assert.ok(buf.length > 1000, `pdf demasiado pequeño: ${buf.length}`)
  assert.equal(buf.subarray(0, 5).toString('latin1'), '%PDF-')
  const cuerpo = buf.toString('latin1')
  const paginas = (cuerpo.match(/\/Type\s*\/Page[^s]/g) || []).length
  assert.ok(paginas >= 1, `páginas encontradas: ${paginas}`)
})
