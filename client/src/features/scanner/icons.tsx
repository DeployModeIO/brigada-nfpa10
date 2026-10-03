/** Íconos propios del escáner (no se toca el set compartido). */
import type { SVGProps } from 'react'
import type { IconProps } from '../../components/icons'

function base({ size = 24, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none' as const,
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...rest,
  }
}

export const FlashlightIcon = (p: SVGProps<SVGSVGElement> & IconProps) => (
  <svg {...base(p)}><path d="M9 2h6v3l-1 2v13h-4V7L9 5V2Z" /><path d="M10 11h4" /></svg>
)

export const UploadIcon = (p: SVGProps<SVGSVGElement> & IconProps) => (
  <svg {...base(p)}><path d="M12 16V4" /><path d="m7 9 5-5 5 5" /><path d="M4 20h16" /></svg>
)

export const PrinterIcon = (p: SVGProps<SVGSVGElement> & IconProps) => (
  <svg {...base(p)}><path d="M7 8V3h10v5" /><rect x="4" y="8" width="16" height="9" rx="2" /><path d="M7 14h10v7H7v-7Z" /></svg>
)

export const CameraIcon = (p: SVGProps<SVGSVGElement> & IconProps) => (
  <svg {...base(p)}><path d="M4 8h3l2-3h6l2 3h3v12H4V8Z" /><circle cx="12" cy="13" r="3.5" /></svg>
)

export const SoundOnIcon = (p: SVGProps<SVGSVGElement> & IconProps) => (
  <svg {...base(p)}><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="M16 9a4 4 0 0 1 0 6" /><path d="M18.5 6.5a8 8 0 0 1 0 11" /></svg>
)

export const SoundOffIcon = (p: SVGProps<SVGSVGElement> & IconProps) => (
  <svg {...base(p)}><path d="M4 9v6h4l5 4V5L8 9H4Z" /><path d="m16 10 5 4M21 10l-5 4" /></svg>
)

export const QrIcon = (p: SVGProps<SVGSVGElement> & IconProps) => (
  <svg {...base(p)}><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><path d="M14 14h3v3h-3zM20 14h1M14 20h3M20 17v4" /></svg>
)
