/** Íconos propios del dashboard — set canónico Phosphor (MIT), idéntico en los 6 apps. */
import type { IconType } from 'react-icons'
import { PiArrowsClockwise, PiClock } from 'react-icons/pi'
import type { IconProps } from '../../components/icons'

function icono(C: IconType, def = 24) {
  return function Icon({ size = def, ...rest }: IconProps) {
    return <C size={size} aria-hidden focusable={false} {...rest} />
  }
}

export const ClockIconFallback = icono(PiClock)
export const RefreshIcon = icono(PiArrowsClockwise)
