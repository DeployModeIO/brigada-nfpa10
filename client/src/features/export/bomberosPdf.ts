/**
 * Informe para Bomberos/Auditoría (spec pantalla 11): construcción 100 % local del
 * ContentDocument de pdfmake — sin red, sin CDN. Cobertura por área, morosidad,
 * rechazos abiertos, firmas del inspector/jefe de brigada y QR agregado del período.
 * Función PURA (docDef) → testeable en node; el render pdfmake vive en ExportPage.
 */
import type { PanelReal, PanelItem } from '../dashboard/semforo'
import { areaDe } from '../planta/pins'

export interface Cobertura {
  area: string
  total: number
  vigente: number
  por_vencer: number
  vencido: number
  rechazado: number
  sin_inspeccionar: number
  /** % de equipos con inspección registrada que NO están al día */
  morosidadPct: number
}

type ItemExt = { tag: string; ubicacion: string; metadata?: Record<string, unknown> | null }

export function coberturasPorArea(panel: PanelReal, todos: ItemExt[]): Cobertura[] {
  const porTag = new Map<string, { area: string; estado: string }>()
  const grupo = (arr: PanelItem[], estado: string) => {
    for (const it of arr) {
      porTag.set(it.tag, {
        area: areaDe({ ubicacion: it.ubicacion, metadata: (it as unknown as { metadata?: Record<string, unknown> | null }).metadata ?? null }),
        estado,
      })
    }
  }
  grupo(panel.verde, 'vigente')
  grupo(panel.amarillo, 'por_vencer')
  grupo(panel.rojo, 'vencido')
  grupo(panel.negro, 'rechazado')
  for (const t of todos) {
    if (!porTag.has(t.tag)) porTag.set(t.tag, { area: areaDe({ ubicacion: t.ubicacion, metadata: t.metadata ?? null }), estado: 'sin_inspeccionar' })
  }
  const porArea = new Map<string, Cobertura>()
  for (const { area, estado } of porTag.values()) {
    let c = porArea.get(area)
    if (!c) { c = { area, total: 0, vigente: 0, por_vencer: 0, vencido: 0, rechazado: 0, sin_inspeccionar: 0, morosidadPct: 0 }; porArea.set(area, c) }
    c.total += 1
    if (estado === 'vigente') c.vigente += 1
    else if (estado === 'por_vencer') c.por_vencer += 1
    else if (estado === 'vencido') c.vencido += 1
    else if (estado === 'rechazado') c.rechazado += 1
    else c.sin_inspeccionar += 1
  }
  for (const c of porArea.values()) {
    const conInsp = c.vigente + c.por_vencer + c.vencido + c.rechazado
    c.morosidadPct = conInsp ? Math.round(((c.vencido + c.rechazado) / conInsp) * 100) : 100
  }
  return [...porArea.values()].sort((a, b) => b.rechazado - a.rechazado || b.vencido - a.vencido || a.area.localeCompare(b.area))
}

export interface ParamsInforme {
  appName: string
  periodo: string
  generado: string
  coberturas: Cobertura[]
  rechazosAbiertos: Array<{ tag: string; ubicacion: string; motivo: string }>
  inspectorNombre: string
  jefeBrigadaNombre: string
  qrDataUrl?: string | null
}

/** docDef de pdfmake (A4, acta de Bomberos). Devuelve objeto puro — sin render aquí. */
export function docBomberosPdf(p: ParamsInforme): Record<string, unknown> {
  const total = p.coberturas.reduce((s, c) => s + c.total, 0)
  const rej = p.coberturas.reduce((s, c) => s + c.rechazado, 0)
  const venc = p.coberturas.reduce((s, c) => s + c.vencido, 0)
  const content: unknown[] = [
    { text: p.appName, style: 'h1' },
    { text: `Informe de cobertura contra incendio — Bomberos / Auditoría · Período ${p.periodo}`, style: 'h2' },
    { text: `Generado: ${p.generado} · Equipos registrados: ${total} · Vencidos: ${venc} · Rechazados (NO APTOS): ${rej}`, fontSize: 9, color: '#555555' },
    { columns: [
      { width: '*', text: `Inspector que informa: ${p.inspectorNombre}`, fontSize: 9, margin: [0, 6, 0, 0] },
      p.qrDataUrl ? { width: 90, image: p.qrDataUrl, fit: [88, 88], margin: [0, 0, 0, 0] } : { width: 90, text: '' },
    ] },
    { text: '1. Cobertura por área', style: 'h3', pageBreak: 'no' },
    {
      table: {
        headerRow: ['Área', 'Total', 'Vigentes', 'Por vencer', 'Vencidos', 'Rechazados', 'Sin insp.', 'Morosidad %'],
        body: p.coberturas.map((c) => [c.area, String(c.total), String(c.vigente), String(c.por_vencer), String(c.vencido), String(c.rechazado), String(c.sin_inspeccionar), `${c.morosidadPct}%`]),
      },
      layout: 'lightHorizontalLines',
      fontSize: 9,
      margin: [0, 4, 0, 10],
    },
    { text: '2. Rechazos abiertos (NO APTO / REQUIERE REEMPLAZO INMEDIATO)', style: 'h3' },
    p.rechazosAbiertos.length
      ? {
          ol: p.rechazosAbiertos.map((r) => `${r.tag} — ${r.ubicacion} · motivo: ${r.motivo}`),
          fontSize: 9,
        }
      : { text: 'Sin rechazos abiertos en el período.', fontSize: 9, italics: true },
    { text: '3. Firmas', style: 'h3', margin: [0, 14, 0, 0] },
    {
      columns: [
        { width: '*', stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 24, x2: 200, y2: 24, lineWidth: 0.7 }] },
          { text: `Inspector de brigada — ${p.inspectorNombre}`, fontSize: 8 },
        ] },
        { width: '*', stack: [
          { canvas: [{ type: 'line', x1: 0, y1: 24, x2: 200, y2: 24, lineWidth: 0.7 }] },
          { text: `Jefe de brigada — ${p.jefeBrigadaNombre}`, fontSize: 8 },
        ] },
      ],
      margin: [0, 8, 0, 0],
    },
    { canvas: [{ type: 'line', x1: 0, y1: 24, x2: 200, y2: 24, lineWidth: 0.7 }], margin: [0, 14, 0, 0] },
    { text: 'Representante Bomberos de Chile / Auditor (timbre y firma)', fontSize: 8 },
  ]
  return {
    pageSize: 'A4',
    pageOrientation: 'portrait',
    info: { title: `Bomberos ${p.appName} ${p.periodo}`, creator: `${p.appName} — Minería Suite (brigada-nfpa10)`, printer: 'Minería Suite' },
    styles: {
      h1: { fontSize: 16, bold: true, margin: [0, 0, 0, 2] },
      h2: { fontSize: 11, bold: true, margin: [0, 0, 0, 6] },
      h3: { fontSize: 10, bold: true, margin: [0, 8, 0, 2] },
    },
    defaultStyle: { fontSize: 10 },
    content,
  }
}
