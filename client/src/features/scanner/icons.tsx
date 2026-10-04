/** Íconos propios del escáner — set canónico Phosphor (MIT), mismos significados en los 6 apps. */
import type { IconType } from 'react-icons'
import {
  PiCamera,
  PiFlashlight,
  PiPrinter,
  PiQrCode,
  PiSpeakerHigh,
  PiSpeakerSlash,
  PiUploadSimple,
} from 'react-icons/pi'
import type { IconProps } from '../../components/icons'

function icono(C: IconType, def = 24) {
  return function Icon({ size = def, ...rest }: IconProps) {
    return <C size={size} aria-hidden focusable={false} {...rest} />
  }
}

export const FlashlightIcon = icono(PiFlashlight)
export const UploadIcon = icono(PiUploadSimple)
export const PrinterIcon = icono(PiPrinter)
export const CameraIcon = icono(PiCamera)
export const SoundOnIcon = icono(PiSpeakerHigh)
export const SoundOffIcon = icono(PiSpeakerSlash)
export const QrIcon = icono(PiQrCode)
