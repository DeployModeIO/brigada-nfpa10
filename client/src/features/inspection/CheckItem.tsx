/** Interruptor segmentado Pasa/Falla — táctil ≥56px, aria-pressed, color+icono+texto. */
import { CheckIcon, CloseIcon } from '../../components/icons'

interface Props {
  clave: string
  etiqueta: string
  critico: boolean
  valor: boolean | undefined
  mostrarError: boolean
  onChange: (v: boolean) => void
}

const BASE =
  'flex min-h-14 flex-1 items-center justify-center gap-2 rounded-lg border-2 text-base font-semibold transition-colors'

export default function CheckItem({ clave, etiqueta, critico, valor, mostrarError, onChange }: Props) {
  const sinResponder = mostrarError && typeof valor !== 'boolean'
  const errId = `error-${clave}`
  return (
    <li
      id={`item-${clave}`}
      className={`rounded-xl border bg-surface p-3 ${sinResponder ? 'border-err' : 'border-border'}`}
    >
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-medium">{etiqueta}</span>
        {critico && (
          <span className="rounded bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">
            crítico — un fallo rechaza el extintor
          </span>
        )}
      </div>
      <div role="group" aria-label={`Resultado para ${etiqueta}`} className="grid grid-cols-2 gap-2">
        <button
          type="button"
          data-testid={`pasa-${clave}`}
          aria-pressed={valor === true}
          aria-describedby={sinResponder ? errId : undefined}
          onClick={() => onChange(true)}
          className={`${BASE} ${
            valor === true
              ? 'border-ok bg-ok/15 text-ok'
              : 'border-border text-text2 hover:border-ok hover:text-ok active:border-ok active:text-ok'
          }`}
        >
          <CheckIcon size={22} />
          Pasa
        </button>
        <button
          type="button"
          data-testid={`falla-${clave}`}
          aria-pressed={valor === false}
          aria-describedby={sinResponder ? errId : undefined}
          onClick={() => onChange(false)}
          className={`${BASE} ${
            valor === false
              ? 'border-err bg-err/15 text-err'
              : 'border-border text-text2 hover:border-err hover:text-err active:border-err active:text-err'
          }`}
        >
          <CloseIcon size={22} />
          Falla
        </button>
      </div>
      {sinResponder && (
        <p id={errId} role="alert" className="mt-2 flex items-center gap-1.5 text-sm font-medium text-err">
          <CloseIcon size={16} />
          Responde este ítem antes de guardar.
        </p>
      )}
    </li>
  )
}
