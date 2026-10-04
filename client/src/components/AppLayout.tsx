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
  MapIcon,
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
  { to: '/planta', etiqueta: 'Planta', icono: MapIcon },
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
  const { usuario, autenticado, logout } = useAuth()
  const navigate = useNavigate()

  return (
    <div className="flex min-h-dvh bg-bg text-text">
      {/* Sidebar escritorio/tablet-lg: logo + secciones + acciones, siempre visible */}
      <aside
        aria-label="Navegación lateral"
        className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-border bg-surface lg:flex xl:w-64"
      >
        <div className="flex items-center gap-3 border-b border-border px-4 py-4">
          {config.logoDataUrl ? (
            <img src={config.logoDataUrl} alt="" className="h-9 w-9 shrink-0 rounded" />
          ) : (
            <ShieldFlameIcon size={30} className="shrink-0 text-primary" />
          )}
          <span className="min-w-0 flex-1 text-base font-semibold leading-tight">{config.appName}</span>
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Navegación principal">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ to, etiqueta, icono: Icono, end }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={end}
                  className={({ isActive }) =>
                    `flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors ${
                      isActive ? 'bg-primary/10 text-primary' : 'text-text2 hover:bg-bg2 hover:text-text'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icono size={20} />
                      <span>{etiqueta}</span>
                      {isActive ? <span className="sr-only"> (página actual)</span> : null}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex flex-col gap-1 border-t border-border px-2 py-3">
          <button
            type="button"
            onClick={() => setTema(TEMAS_CICLO[tema])}
            aria-label={`Cambiar tema. Tema actual: ${TEMA_ETIQUETA[tema]}`}
            title={`Tema: ${TEMA_ETIQUETA[tema]} (clic para cambiar)`}
            className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm text-text2 hover:bg-bg2 hover:text-text active:bg-bg2"
          >
            <TemaIcon tema={tema} />
            <span>Tema: {TEMA_ETIQUETA[tema]}</span>
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
              className="flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm text-text2 hover:bg-bg2 hover:text-err active:bg-bg2"
            >
              <LogoutIcon size={20} />
              <span className="truncate">{usuario?.nombre ? `Salir (${usuario.nombre})` : 'Salir'}</span>
            </button>
          )}
        </div>
      </aside>

      {/* Columna de contenido: header de acciones siempre visible + main + nav inferior móvil */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-border bg-surface/95 backdrop-blur">
          <div className="mx-auto flex w-full max-w-screen-sm items-center gap-3 px-4 py-2 md:max-w-screen-md lg:max-w-[1400px]">
            {config.logoDataUrl ? (
              <img src={config.logoDataUrl} alt="" className="h-8 w-8 shrink-0 rounded lg:hidden" />
            ) : (
              <ShieldFlameIcon size={28} className="shrink-0 text-primary lg:hidden" />
            )}
            <span className="min-w-0 flex-1 truncate text-base font-semibold lg:hidden">{config.appName}</span>

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

        <main className="mx-auto w-full max-w-screen-sm flex-1 px-4 py-4 pb-28 md:max-w-screen-md lg:max-w-[1400px] lg:px-6 lg:pb-10">
          <Outlet />
        </main>

        <nav
          aria-label="Navegación principal"
          className="pb-safe fixed inset-x-0 bottom-0 z-20 border-t border-border bg-surface lg:hidden"
        >
          <ul className="mx-auto grid max-w-screen-sm grid-cols-6">
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
    </div>
  )
}

const TEMAS_CICLO: Record<Tema, Tema> = { dark: 'light', light: 'read', read: 'dark' }
