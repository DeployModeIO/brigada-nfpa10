/** Semáforo del estado calculado — solo tokens semánticos, icono + texto. */
import { AlertIcon, CheckIcon } from '../../components/icons'

const MAPA: Record<string, { label: string; cls: string; ok: boolean }> = {
  vigente: { label: 'Vigente', cls: 'border-ok text-ok bg-ok/10', ok: true },
  por_vencer: { label: 'Por vencer', cls: 'border-warn text-warn bg-warn/10', ok: false },
  vencido: { label: 'Vencido', cls: 'border-err text-err bg-err/10', ok: false },
  rechazado: { label: 'Rechazado', cls: 'border-err text-err bg-err/15', ok: false },
  sin_inspeccionar: { label: 'Sin inspeccionar', cls: 'border-info text-info bg-info/10', ok: false },
}

export default function StatusBadge({ estado, etiqueta }: { estado: string; etiqueta?: string }) {
  const m = MAPA[estado] ?? { label: estado || 'Desconocido', cls: 'border-border text-text2', ok: false }
  const Icono = m.ok ? CheckIcon : AlertIcon
  return (
    <span
      data-testid="estado-badge"
      className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border-2 px-3 py-1 text-sm font-semibold ${m.cls}`}
    >
      <Icono size={16} />
      {etiqueta ?? m.label}
    </span>
  )
}
