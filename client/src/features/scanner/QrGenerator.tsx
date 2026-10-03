/**
 * BONUS — Generador de etiquetas QR: tag → qrcode.toDataURL (512 px), preview,
 * descarga PNG e impresión de la etiqueta (ventana de impresión dedicada + @media print).
 */
import { useState, type FormEvent } from 'react'
import QRCode from 'qrcode'
import { DownloadIcon } from '../../components/icons'
import { PrinterIcon, QrIcon } from './icons'
import { esTagValido } from './tagUtils'

/**
 * Colores literales del canvas QR: no son tematizables — la norma de impresión exige
 * contraste máximo negro/blanco para lectura fiable; no son colores de la UI.
 */
const QR_OSCURO = '#000000'
const QR_CLARO = '#FFFFFF'

export function QrGenerator() {
  const [tag, setTag] = useState('')
  const [dataUrl, setDataUrl] = useState<string | null>(null)
  const [generado, setGenerado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generando, setGenerando] = useState(false)
  const [descargando, setDescargando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)

  const generar = async (ev?: FormEvent) => {
    ev?.preventDefault()
    const t = tag.trim().toUpperCase()
    if (!esTagValido(t)) {
      setDataUrl(null)
      setError('Tag inválido: usa 2–32 caracteres alfanuméricos (guiones y _ permitidos).')
      return
    }
    setError(null)
    setAviso(null)
    setGenerando(true)
    try {
      const url = await QRCode.toDataURL(t, {
        width: 512,
        margin: 2,
        errorCorrectionLevel: 'M',
        color: { dark: QR_OSCURO, light: QR_CLARO },
      })
      setDataUrl(url)
      setGenerado(t)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo generar el QR.')
    } finally {
      setGenerando(false)
    }
  }

  const descargar = () => {
    if (!dataUrl || !generado) return
    setDescargando(true)
    const a = document.createElement('a')
    a.href = dataUrl
    a.download = `etiqueta-${generado}.png`
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => setDescargando(false), 800)
    setAviso(`PNG de ${generado} descargado.`)
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={generar} className="rounded-xl border border-border bg-surface p-4" aria-label="Generar etiqueta QR">
        <label htmlFor="qr-tag" className="mb-2 block font-semibold">
          Tag del extintor
        </label>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            id="qr-tag"
            data-testid="qr-tag-input"
            type="text"
            autoComplete="off"
            spellCheck={false}
            placeholder="Ej. EXTF-COC-001"
            value={tag}
            onChange={(e) => setTag(e.target.value)}
            className="min-h-14 min-w-0 flex-1 rounded-lg border border-border bg-bg px-3 font-mono text-base uppercase"
          />
          <button
            type="submit"
            disabled={generando || !tag.trim()}
            aria-busy={generando}
            className="flex min-h-14 items-center justify-center gap-2 rounded-lg bg-primary px-5 font-semibold text-on-primary disabled:opacity-60"
          >
            <QrIcon size={20} />
            {generando ? 'Generando…' : 'Generar QR'}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-sm font-medium text-err">
            {error}
          </p>
        )}
      </form>

      {dataUrl && generado && (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-border bg-surface p-4">
          <img
            src={dataUrl}
            alt={`Código QR de la etiqueta ${generado}`}
            data-testid="qr-preview"
            width={512}
            height={512}
            className="h-56 w-56 rounded-lg bg-white p-2"
          />
          <p className="font-mono text-lg font-semibold" role="status">
            {generado}
          </p>
          <p className="text-center text-sm text-text2">
            Contenido codificado: <code className="font-mono">{generado}</code> — el escáner abre{' '}
            <code className="font-mono">/inspeccion/{generado}</code>.
          </p>
          <div className="grid w-full grid-cols-2 gap-2">
            <button
              type="button"
              onClick={descargar}
              aria-busy={descargando}
              className="flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 border-primary bg-primary/10 px-3 font-semibold text-primary"
            >
              <DownloadIcon size={20} />
              {descargando ? 'Descargando…' : 'Descargar PNG'}
            </button>
            <button
              type="button"
              data-testid="imprimir-etiqueta"
              onClick={() => window.print()}
              className="flex min-h-14 items-center justify-center gap-2 rounded-lg border-2 border-ok bg-ok/10 px-3 font-semibold text-ok"
            >
              <PrinterIcon size={20} />
              Imprimir etiqueta
            </button>
          </div>
          <p role="status" className="min-h-6 text-sm text-text2">
            {aviso}
          </p>
        </div>
      )}

      {dataUrl && generado && (
        <>
          <style>{`
@media print {
  body * { visibility: hidden !important; }
  .qr-print-area, .qr-print-area * { visibility: visible !important; }
  .qr-print-area {
    position: fixed; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 12px;
  }
  .qr-print-area img { width: 46mm; height: 46mm; }
}
`}</style>
          <div aria-hidden className="qr-print-area hidden print:flex">
            <img src={dataUrl} alt="" width={512} height={512} />
            <p style={{ fontWeight: 700, fontSize: '16pt' }}>{generado}</p>
            <p style={{ fontSize: '9pt' }}>Brigada NFPA 10 — inspección mensual</p>
          </div>
        </>
      )}
    </div>
  )
}
