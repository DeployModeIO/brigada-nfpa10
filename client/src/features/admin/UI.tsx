/** Piezas de UI compartidas dentro del feature admin (solo tokens semánticos, targets ≥56px). */
import { useState, type ReactNode } from 'react'
import { AlertIcon, CheckIcon, CloseIcon } from '../../components/icons'

export function Aviso({ tipo, children }: { tipo: 'ok' | 'err' | 'info' | 'warn'; children: ReactNode }) {
  const clases =
    tipo === 'ok'
      ? 'border-ok bg-ok/10 text-ok'
      : tipo === 'err'
        ? 'border-err bg-err/10 text-err'
        : tipo === 'warn'
          ? 'border-warn bg-warn/10 text-warn'
          : 'border-info bg-info/10 text-info'
  return (
    <p role={tipo === 'err' ? 'alert' : 'status'} aria-live="polite" className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${clases}`}>
      {tipo === 'err' || tipo === 'warn' ? <AlertIcon size={16} className="mt-0.5 shrink-0" /> : <CheckIcon size={16} className="mt-0.5 shrink-0" />}
      <span>{children}</span>
    </p>
  )
}

export function CampoError({ id, children }: { id?: string; children: ReactNode }) {
  if (!children) return null
  return (
    <p id={id} role="alert" className="mt-1 text-xs text-err">
      {children}
    </p>
  )
}

/** Botón de acción con confirmación inline en dos pasos (no window.confirm). */
export function BotonConfirmar({
  etiqueta,
  etiquetaConfirmar = '¿Confirmar?',
  onConfirmar,
  disabled,
  clase = 'border-err text-err',
  ariaLabel,
}: {
  etiqueta: string
  etiquetaConfirmar?: string
  onConfirmar: () => Promise<void> | void
  disabled?: boolean
  clase?: string
  ariaLabel?: string
}) {
  const [confirmando, setConfirmando] = useState(false)
  const [ocupado, setOcupado] = useState(false)
  return (
    <button
      type="button"
      disabled={disabled || ocupado}
      aria-label={ariaLabel ?? etiqueta}
      onClick={async () => {
        if (!confirmando) {
          setConfirmando(true)
          setTimeout(() => setConfirmando(false), 4000)
          return
        }
        setOcupado(true)
        try {
          await onConfirmar()
          setConfirmando(false)
        } finally {
          setOcupado(false)
        }
      }}
      className={`flex min-h-14 items-center justify-center gap-2 rounded-lg border bg-surface px-3 text-sm font-semibold hover:bg-bg2 disabled:opacity-60 ${clase}`}
    >
      {confirmando ? <CloseIcon size={16} /> : null}
      {ocupado ? '…' : confirmando ? etiquetaConfirmar : etiqueta}
    </button>
  )
}

export const inputCls =
  'min-h-14 w-full rounded-lg border border-border bg-bg2 px-3 text-base text-text placeholder:text-text2/60 focus:border-primary'

export const btnPrimarioCls =
  'flex min-h-14 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-60'
