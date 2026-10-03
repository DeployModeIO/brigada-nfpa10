/** Íconos SVG monocromos inline (currentColor). Shell + features comparten este set. */
import type { SVGProps } from 'react'

export interface IconProps extends SVGProps<SVGSVGElement> {
  size?: number
}

function base({ size = 24, ...rest }: IconProps) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
    ...rest,
  }
}

export const HomeIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /><path d="M10 21v-6h4v6" /></svg>
)

export const ScanIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 8V4h4" /><path d="M20 8V4h-4" /><path d="M4 16v4h4" /><path d="M20 16v4h-4" /><path d="M4 12h16" /></svg>
)

export const ClipboardIcon = (p: IconProps) => (
  <svg {...base(p)}><rect x="6" y="4" width="12" height="17" rx="2" /><path d="M9 4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1H9v-1Z" /><path d="M9 10h6M9 14h6M9 18h4" /></svg>
)

export const AlertIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 4 3 19h18L12 4Z" /><path d="M12 10v4" /><circle cx="12" cy="17" r=".5" fill="currentColor" /></svg>
)

export const GearIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" /></svg>
)

export const SearchIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)

export const SunIcon = (p: IconProps) => (
  <svg {...base(p)}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9 6.3 6.3M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>
)

export const MoonIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M20 13.5A8 8 0 0 1 10.5 4 7 7 0 1 0 20 13.5Z" /></svg>
)

export const BookIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M4 5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 0-2 2V5Z" /><path d="M8 7h8M8 11h8" /></svg>
)

export const LogoutIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M9 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h4" /><path d="M15 8l4 4-4 4" /><path d="M19 12H9" /></svg>
)

export const ShieldFlameIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 2 4 5v6c0 5 3.5 8.5 8 11 4.5-2.5 8-6 8-11V5l-8-3Z" /><path d="M12 8c1.8 2 2.8 3.3 2.8 4.8A2.8 2.8 0 0 1 12 15.6a2.8 2.8 0 0 1-2.8-2.8C9.2 11.3 10.2 10 12 8Z" /></svg>
)

export const DownloadIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M4 21h16" /></svg>
)

export const CheckIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m4 13 4 4L20 5" /></svg>
)

export const CloseIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M6 6l12 12M18 6 6 18" /></svg>
)

export const OfflineIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="M3 3l18 18" /><path d="M8.5 16.5a5 5 0 0 1 7 0" /><path d="M5 13a10 10 0 0 1 5-2.6" /><path d="M19 13a10 10 0 0 0-4-2.4" /><circle cx="12" cy="20" r=".5" fill="currentColor" /></svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <svg {...base(p)}><path d="m9 6 6 6-6 6" /></svg>
)
