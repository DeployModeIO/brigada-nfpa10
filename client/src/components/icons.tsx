/** Set canónico de íconos de la línea Suite Minería (idéntico en los 6 apps).
 *  Navegación, acciones de botón y estados: Phosphor (MIT) vía react-icons `Pi*`.
 *  Sello de seguridad industrial: Material Symbols (Apache-2.0) `MdHealthAndSafety`.
 *  Monocromo currentColor: los consumidores colorean con className `text-*`.
 *  Se conservan los nombres exportados del set anterior para no tocar consumidores. */
import type { SVGProps } from 'react'
import type { IconType } from 'react-icons'
import {
  PiBookOpenText,
  PiCamera,
  PiCaretRight,
  PiChartBar,
  PiCheckCircle,
  PiClipboardText,
  PiDownloadSimple,
  PiFilePdf,
  PiFileXls,
  PiFirstAidKit,
  PiGear,
  PiGraduationCap,
  PiHouseLine,
  PiInfo,
  PiMagnifyingGlass,
  PiMapPin,
  PiMapTrifold,
  PiMinus,
  PiMoon,
  PiPlug,
  PiPlus,
  PiProhibit,
  PiQrCode,
  PiSignOut,
  PiSun,
  PiTruck,
  PiUsers,
  PiWarningCircle,
  PiWifiX,
  PiXCircle,
} from 'react-icons/pi'
import { MdHealthAndSafety } from 'react-icons/md'

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function icono(C: IconType, def = 24) {
  return function Icon({ size = def, ...rest }: IconProps) {
    return <C size={size} aria-hidden focusable={false} {...rest} />
  }
}

export const HomeIcon = icono(PiHouseLine)
export const CameraIcon = icono(PiCamera)
export const LocationIcon = icono(PiMapPin)
export const ScanIcon = icono(PiQrCode)
export const ClipboardIcon = icono(PiClipboardText)
export const AlertIcon = icono(PiWarningCircle)
export const InfoIcon = icono(PiInfo)
export const GearIcon = icono(PiGear)
export const PlugIcon = icono(PiPlug)
export const SearchIcon = icono(PiMagnifyingGlass)
export const SunIcon = icono(PiSun)
export const MoonIcon = icono(PiMoon)
export const BookIcon = icono(PiBookOpenText)
export const LogoutIcon = icono(PiSignOut)
export const ShieldFlameIcon = icono(MdHealthAndSafety)
export const DownloadIcon = icono(PiDownloadSimple)
export const FilePdfIcon = icono(PiFilePdf)
export const FileXlsIcon = icono(PiFileXls)
export const CheckIcon = icono(PiCheckCircle)
export const CloseIcon = icono(PiXCircle)
export const OfflineIcon = icono(PiWifiX)
export const ChevronRightIcon = icono(PiCaretRight)
export const PlusIcon = icono(PiPlus)
export const MinusIcon = icono(PiMinus)
export const StopIcon = icono(PiProhibit)
export const TruckIcon = icono(PiTruck)
export const MapIcon = icono(PiMapTrifold)
export const ChartIcon = icono(PiChartBar)
export const GraduationCapIcon = icono(PiGraduationCap)
export const UsersIcon = icono(PiUsers)
export const FirstAidKitIcon = icono(PiFirstAidKit)
