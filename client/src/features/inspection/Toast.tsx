/** Aviso temporal accesible (role status/alert) para el resultado de guardar. */
import { useEffect } from 'react'
import { AlertIcon, CheckIcon, CloseIcon, OfflineIcon } from '../../components/icons'

export interface ToastData {
  tipo: 'ok' | 'err' | 'info'
  titulo: string
  mensaje?: string
}

const ESTILOS: Record<ToastData['tipo'], string> = {
  ok: 'border-ok text-ok bg-ok/10',
  err: 'border-err text-err bg-err/10',
  info: 'border-info text-info bg-info/10',
}

export default function Toast({ data, onClose }: { data: ToastData; onClose: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(onClose, 7000)
    return () => window.clearTimeout(t)
  }, [data, onClose])

  const Icono = data.tipo === 'ok' ? CheckIcon : data.tipo === 'err' ? AlertIcon : OfflineIcon
  return (
    <div
      data-testid="toast"
      role={data.tipo === 'err' ? 'alert' : 'status'}
      aria-live={data.tipo === 'err' ? 'assertive' : 'polite'}
      className={`fixed inset-x-4 bottom-24 z-50 mx-auto flex max-w-screen-sm items-start gap-3 rounded-xl border-2 bg-surface p-4 shadow-lg ${ESTILOS[data.tipo]}`}
    >
      <Icono size={24} className="mt-0.5 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{data.titulo}</p>
        {data.mensaje && <p className="mt-1 text-sm text-text">{data.mensaje}</p>}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label="Cerrar aviso"
        className="flex min-h-14 shrink-0 items-center gap-1 rounded-lg px-2 text-sm font-medium text-text2 hover:text-text"
      >
        <CloseIcon size={18} />
        Cerrar
      </button>
    </div>
  )
}
