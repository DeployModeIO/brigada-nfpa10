/**
 * Exportar (ruta /export).
 * - XLSX: GET /export/extinguishers.xlsx autenticado (fetch blob con token → descarga).
 * - PDF informe mensual (pdfmake): portada (logo ConfigContext + appName + fecha),
 *   tabla de inspecciones del mes (GET /inspections?desde&hasta paginado completo),
 *   tabla del semáforo y leyenda accesible; selector de mes.
 * - Datos de la base: JSON completo de GET /extinguishers (paginado recorrido).
 */
import { useMemo, useState } from 'react'
import pdfMakeDefault from 'pdfmake/build/pdfmake'
import pdfFontsDefault from 'pdfmake/build/vfs_fonts'

/**
 * El bundle de navegador de pdfmake 0.2.23 expone createPdf(...) y addVirtualFileSystem(...)
 * (verificado en runtime; createPdfDocument solo existe en el build Node del shim).
 */
interface PdfApi {
  createPdf?: (dd: Record<string, unknown>) => { getBlob: (cb: (b: Blob) => void) => void; download: (n: string) => void }
  createPdfDocument?: (dd: Record<string, unknown>) => { getBlob: () => Promise<Blob> }
  addVirtualFileSystem?: (vfs: Record<string, string>) => void
  vfs?: Record<string, string>
}
const PM: PdfApi =
  (pdfMakeDefault as unknown as { pdfMake?: PdfApi }).pdfMake ?? (pdfMakeDefault as unknown as PdfApi)

function asegurarFuentes(): void {
  const vfs = pdfFontsDefault as unknown as Record<string, string>
  if (!vfs || PM.vfs && Object.keys(PM.vfs).length > 0) return
  if (typeof PM.addVirtualFileSystem === 'function') PM.addVirtualFileSystem(vfs)
  else PM.vfs = vfs
}

function crearPdf(dd: Record<string, unknown>): Promise<Blob> {
  asegurarFuentes()
  if (typeof PM.createPdfDocument === 'function') return PM.createPdfDocument(dd).getBlob()
  if (typeof PM.createPdf === 'function') {
    return new Promise<Blob>((resolve, reject) => {
      try {
        PM.createPdf!(dd).getBlob((b) => resolve(b))
      } catch (e) {
        reject(e)
      }
    })
  }
  return Promise.reject(new Error('pdfmake no expone createPdf/createPdfDocument en este bundle'))
}
import { api } from '../../lib/api'
import { useConfig } from '../../context/ConfigContext'
import { AlertIcon, ClipboardIcon, DownloadIcon } from '../../components/icons'
import { MESES_LARGOS, CATEGORIAS, contDe, type PanelReal } from '../dashboard/semforo'
import { bytesHumanos, descargarConAuth, paginadoCompleto, volcar } from './descargas'

interface InspeccionReal {
  id: number
  tag: string
  resultados: Record<string, boolean>
  fallas: string[]
  criticas_fallan: number
  observaciones: string | null
  dispositivo: string | null
  inspector_id: number | null
  inspector_username: string | null
  created_at: string
  tiene_foto: boolean
}

type Accion = 'idle' | 'xlsx' | 'pdf' | 'json'

function mesActual(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function rangoMes(mes: string): { desde: string; hasta: string; etiqueta: string } {
  const [y, m] = mes.split('-').map(Number)
  const primerDia = new Date(Date.UTC(y, m - 1, 1))
  const ultimoDia = new Date(Date.UTC(y, m, 0))
  return {
    desde: `${primerDia.toISOString().slice(0, 10)}`,
    hasta: `${ultimoDia.toISOString().slice(0, 10)}T23:59:59.999Z`,
    etiqueta: `${MESES_LARGOS[m - 1]} de ${y}`,
  }
}

function fechaHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export default function ExportPage() {
  const { config } = useConfig()
  const [mes, setMes] = useState(mesActual)
  const [accion, setAccion] = useState<Accion>('idle')
  const [estado, setEstado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const etiquetaMes = useMemo(() => rangoMes(mes).etiqueta, [mes])

  async function descargarXlsx() {
    setAccion('xlsx')
    setError(null)
    setEstado('Generando XLSX del inventario…')
    try {
      const bytes = await descargarConAuth('/export/extinguishers.xlsx', 'brigada-nfpa10-extintores.xlsx')
      setEstado(`XLSX descargado (${bytesHumanos(bytes)}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo descargar el XLSX.')
      setEstado(null)
    } finally {
      setAccion('idle')
    }
  }

  async function descargarJson() {
    setAccion('json')
    setError(null)
    setEstado('Extrayendo datos de la base…')
    try {
      const items = await paginadoCompleto<Record<string, unknown>>('/extinguishers')
      const json = JSON.stringify({ extraidoEl: new Date().toISOString(), total: items.length, items }, null, 2)
      volcar(new Blob([json], { type: 'application/json' }), 'brigada-nfpa10-extintores.json')
      setEstado(`JSON descargado: ${items.length} extintores (${bytesHumanos(json.length)}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo exportar la base.')
      setEstado(null)
    } finally {
      setAccion('idle')
    }
  }

  async function generarPdf() {
    setAccion('pdf')
    setError(null)
    const { desde, hasta, etiqueta } = rangoMes(mes)
    try {
      setEstado(`Leyendo inspecciones de ${etiqueta}…`)
      const [panel, inspecciones] = await Promise.all([
        api.get<PanelReal>('/alerts/panel'),
        paginadoCompleto<InspeccionReal>(`/inspections?desde=${encodeURIComponent(desde)}&hasta=${encodeURIComponent(hasta)}`),
      ])
      setEstado(`Componiendo PDF (${inspecciones.length} inspecciones)…`)

      const logo =
        config.logoDataUrl && /^data:image\/[a-zA-Z+.-]+;base64,/.test(config.logoDataUrl)
          ? { image: config.logoDataUrl, width: 120, margin: [0, 0, 0, 12] as [number, number, number, number], alignment: 'center' as const }
          : null

      const encabezado: Record<string, unknown>[] = [
        {
          stack: [
            logo,
            { text: config.appName, fontSize: 22, bold: true, alignment: 'center' },
            { text: 'Informe mensual de inspecciones — NFPA 10', fontSize: 14, color: '#555555', alignment: 'center', margin: [0, 4, 0, 4] },
            { text: `Período: ${etiqueta}  ·  Emitido: ${fechaHora(new Date().toISOString())}`, fontSize: 10, alignment: 'center', margin: [0, 0, 0, 18] },
          ],
        },
      ]

      const cuerpo: Record<string, unknown>[] = []

      // Tabla 1: inspecciones del mes
      cuerpo.push({ text: `Inspecciones registradas (${inspecciones.length})`, fontSize: 13, bold: true, margin: [0, 8, 0, 6] as [number, number, number, number] })
      if (inspecciones.length === 0) {
        cuerpo.push({ text: 'Sin inspecciones en este período.', italics: true, color: '#666666' })
      } else {
        cuerpo.push({
          layout: 'lightHorizontalLines',
          fontSize: 8,
          widths: ['auto', 'auto', 'auto', 'auto', 'auto', '*'],
          headerColor: '#333333',
          table: {
            headerRows: 1,
            body: [
              ['Fecha y hora', 'Tag', 'Inspector', 'Conformes', 'Fallas', 'Observaciones'],
              ...inspecciones.map((i) => {
                const total = Object.keys(i.resultados ?? {}).length
                const okCount = total - (i.fallas?.length ?? 0)
                return [
                  fechaHora(i.created_at),
                  i.tag,
                  i.inspector_username ?? String(i.inspector_id ?? '—'),
                  `${okCount}/${total}`,
                  (i.fallas ?? []).join(', ') || '—',
                  (i.observaciones ?? '—').slice(0, 60),
                ]
              }),
            ],
          },
        })
      }

      // Tabla 2: semáforo
      cuerpo.push({ text: 'Semáforo de extintores (estado actual)', fontSize: 13, bold: true, margin: [0, 18, 0, 6] as [number, number, number, number] })
      cuerpo.push({
        layout: 'lightHorizontalLines',
        fontSize: 9,
        widths: ['auto', 'auto', '*'],
        table: {
          headerRows: 1,
          body: [
            ['Categoría', 'Cantidad', 'Acción'],
            ...CATEGORIAS.map((c) => [c.etiqueta, contDe(panel, c.clave), c.descripcion]),
          ],
        },
      })

      // Leyenda accesible (texto, no solo color)
      cuerpo.push({
        margin: [0, 18, 0, 0] as [number, number, number, number],
        stack: [
          { text: 'Leyenda accesible', fontSize: 11, bold: true, margin: [0, 0, 0, 4] as [number, number, number, number] },
          { ul: [
            { text: [{ text: 'Vigente (verde): ', bold: true }, { text: 'inspección al día; sin acción inmediata.' }] },
            { text: [{ text: 'Por vencer (amarillo): ', bold: true }, { text: 'vence en 7 días o menos; planificar recarga.' }] },
            { text: [{ text: 'Vencido (rojo): ', bold: true }, { text: 'fecha superada; reemplazar según la lista de reemplazo.' }] },
            { text: [{ text: 'Rechazado (negro con marca roja): ', bold: true }, { text: 'falla crítica confirmada; fuera de servicio, no usar.' }] },
          ] },
        ],
      })

      const dd = {
        pageSize: 'A4',
        pageMargins: [36, 48, 36, 56] as [number, number, number, number],
        defaultStyle: { fontSize: 10 },
        info: { title: `${config.appName} — informe ${etiqueta}` },
        header: (page: number) => (page > 1 ? { text: `${config.appName} — informe ${etiqueta}`, fontSize: 8, color: '#888888', alignment: 'right' } : ''),
        footer: (_page: number, pages: number) => ({
          text: `Página ${_page} de ${pages} — documento generado desde la aplicación Brigada NFPA 10`,
          fontSize: 8,
          color: '#888888',
          alignment: 'center',
          margin: [0, 8, 0, 0],
        }),
        content: [...encabezado, ...cuerpo],
      }

      const blob = await crearPdf(dd)
      if (blob.size === 0) throw new Error('El PDF generado está vacío.')
      volcar(blob, `informe-${mes}-brigada-nfpa10.pdf`)
      setEstado(`PDF generado: ${etiqueta}, ${inspecciones.length} inspecciones (${bytesHumanos(blob.size)}).`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el PDF.')
      setEstado(null)
    } finally {
      setAccion('idle')
    }
  }

  const ocupado = accion !== 'idle'

  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-export">
      <h1 id="titulo-export" className="flex items-center gap-2 text-xl font-semibold">
        <DownloadIcon size={22} /> Exportar
      </h1>

      <fieldset className="rounded-xl border border-border bg-surface p-4">
        <legend className="px-1 text-sm font-medium text-text2">Período del informe mensual</legend>
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="mes-informe" className="text-sm font-medium">
            Mes
          </label>
          <input
            id="mes-informe"
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value || mesActual())}
            className="min-h-14 rounded-lg border border-border bg-bg2 px-3 font-mono text-base text-text focus:border-primary"
          />
          <span className="text-sm text-text2">Informe: <strong className="text-text">{etiquetaMes}</strong></span>
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-3">
        <button
          type="button"
          onClick={() => void generarPdf()}
          disabled={ocupado}
          aria-busy={accion === 'pdf'}
          className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold hover:bg-bg2 disabled:opacity-60"
        >
          <ClipboardIcon size={22} className="text-primary" />
          {accion === 'pdf' ? 'Generando PDF…' : 'PDF informe mensual'}
        </button>
        <button
          type="button"
          onClick={() => void descargarXlsx()}
          disabled={ocupado}
          aria-busy={accion === 'xlsx'}
          className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold hover:bg-bg2 disabled:opacity-60"
        >
          <DownloadIcon size={22} className="text-ok" />
          {accion === 'xlsx' ? 'Descargando XLSX…' : 'XLSX inventario'}
        </button>
        <button
          type="button"
          onClick={() => void descargarJson()}
          disabled={ocupado}
          aria-busy={accion === 'json'}
          className="flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold hover:bg-bg2 disabled:opacity-60"
        >
          <DownloadIcon size={22} className="text-info" />
          {accion === 'json' ? 'Exportando JSON…' : 'Datos de la base (JSON)'}
        </button>
      </div>

      {estado && (
        <p role="status" aria-live="polite" className="rounded-xl border border-ok bg-ok/10 px-4 py-3 text-sm text-ok">
          {estado}
        </p>
      )}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-xl border border-err bg-err/10 px-4 py-3 text-sm text-err">
          <AlertIcon size={18} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}

      <p className="text-xs text-text2">
        El XLSX lo genera el servidor (ExcelJS, hoja «Extintores» con estado coloreado). El PDF incluye portada con la marca de la
        empresa, tabla de inspecciones del período, tabla del semáforo y leyenda accesible en texto.
      </p>
    </section>
  )
}
