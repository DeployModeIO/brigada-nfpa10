import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useConfig } from '../context/ConfigContext'
import { TEMA_ETIQUETA, useTheme, type Tema } from '../context/ThemeContext'
import {
  AlertIcon,
  BookIcon,
  ClipboardIcon,
  GearIcon,
  HomeIcon,
  LogoutIcon,
  MoonIcon,
  ScanIcon,
  ShieldFlameIcon,
  SunIcon,
} from './icons'

const NAV_ITEMS: Array<{ to: string; etiqueta: string; icono: typeof HomeIcon; end?: boolean }> = [
  { to: '/', etiqueta: 'Inicio', icono: HomeIcon, end: true },
  { to: '/escanear', etiqueta: 'Escanear', icono: ScanIcon },
  { to: '/inspecciones', etiqueta: 'Inspecciones', icono: ClipboardIcon },
  { to: '/alertas', etiqueta: 'Alertas', icono: AlertIcon },
  { to: '/admin', etiqueta: 'Ajustes', icono: GearIcon },
]

function TemaIcon({ tema }: { tema: Tema }) {
  if (tema === 'light') return <SunIcon size={20} />
  if (tema === 'read') return <BookIcon size={20} />
  return <MoonIcon size={20} />
}

export default function AppLayout() {
  const { config } = useConfig()
  const { tema, setTema } = useTheme()
  const { autenticado, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
        <div className="mx-auto flex max-w-screen-sm items-center gap-3 px-4 py-2">
          {config.logoDataUrl ? (
            <img src={config.logoDataUrl} alt="" className="h-8 w-8 shrink-0 rounded" />
          ) : (
            <ShieldFlameIcon size={28} className="shrink-0 text-primary" />
          )}
          <span className="min-w-0 flex-1 truncate text-base font-semibold">{config.appName}</span>

          <button
            type="button"
            onClick={() => setTema(TEMAS_CICLO[tema])}
            aria-label={`Cambiar tema. Tema actual: ${TEMA_ETIQUETA[tema]}`}
            title={`Tema: ${TEMA_ETIQUETA[tema]} (toca para cambiar)`}
            className="flex min-h-14 items-center gap-2 rounded-lg px-3 text-sm text-text2 hover:bg-bg2 hover:text-text active:bg-bg2"
          >
            <TemaIcon tema={tema} />
            <span className="hidden sm:inline">{TEMA_ETIQUETA[tema]}</span>
          </button>

          {autenticado && (
            <button
              type="button"
              onClick={() => {
                logout()
                navigate('/login', { replace: true })
              }}
              aria-label="Cerrar sesión"
              title="Cerrar sesión"
              className="flex min-h-14 items-center gap-2 rounded-lg px-3 text-sm text-text2 hover:bg-bg2 hover:text-err active:bg-bg2"
            >
              <LogoutIcon size={20} />
              <span className="hidden sm:inline">Salir</span>
            </button>
          )}
        </div>
      </header>

      <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 py-4 pb-28">
        <Outlet />
      </main>

      <nav
        aria-label="Navegación principal"
        className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface"
      >
        <ul className="mx-auto grid max-w-screen-sm grid-cols-5">
          {NAV_ITEMS.map(({ to, etiqueta, icono: Icono, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex min-h-14 flex-col items-center justify-center gap-1 text-xs font-medium transition-colors ${
                    isActive ? 'text-primary' : 'text-text2 hover:text-text'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icono size={22} />
                    <span>{etiqueta}</span>
                    {isActive ? <span className="sr-only"> (página actual)</span> : null}
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  )
}

const TEMAS_CICLO: Record<Tema, Tema> = { dark: 'light', light: 'read', read: 'dark' }
