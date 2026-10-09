import { Suspense, lazy, type ComponentType } from 'react'
import { Navigate, createBrowserRouter, createHashRouter, type RouteObject } from 'react-router-dom'
import AppLayout from './components/AppLayout'
import { useAuth } from './context/AuthContext'
import { DEMO_MODE } from './lib/api'

/** lazy() por feature: cada página se carga en su propio chunk (code-splitting real). */
function feature<T extends ComponentType>(name: string, loader: () => Promise<{ default: T }>) {
  void name
  return lazy(loader)
}

const LoginPage = feature('auth', () => import('./features/auth/LoginPage'))
const CambioPasswordPage = feature('auth', () => import('./features/auth/CambioPasswordPage'))
const DashboardPage = feature('dashboard', () => import('./features/dashboard/DashboardPage'))
const ScannerPage = feature('scanner', () => import('./features/scanner/ScannerPage'))
const InspectionFormPage = feature('inspection', () => import('./features/inspection/InspectionFormPage'))
const AlertsPage = feature('alerts', () => import('./features/alerts/AlertsPage'))
const ExportPage = feature('export', () => import('./features/export/ExportPage'))
const AdminSettingsPage = feature('admin', () => import('./features/admin/AdminSettingsPage'))
const ExtinguisherListPage = feature('extinguishers', () => import('./features/extinguishers/ExtinguisherListPage'))
const PlantaPage = feature('planta', () => import('./features/planta/PlantaPage'))
const ExportarPage = feature('terreno', () => import('./features/terreno/ExportarPage'))
const ConfigurarServidorPage = feature('terreno', () => import('./features/terreno/ConfigurarServidorPage'))
const ImportarTerrenoPage = feature('admin', () => import('./features/admin/ImportarTerrenoPage'))

function Cargando() {
  return (
    <div role="status" aria-live="polite" className="flex min-h-dvh items-center justify-center bg-bg text-text2">
      Cargando…
    </div>
  )
}

/** Guard de auth: sin token → /login preservando el destino (deep-linking). */
function RequireAuth({ children }: { children: JSX.Element }) {
  const { autenticado, cargando, passwordRequerida } = useAuth()
  if (cargando) return <Cargando />
  if (passwordRequerida) return <Navigate to="/cambio-password" replace />
  if (!autenticado) return <Navigate to="/login" replace />
  return children
}

function Shell() {
  return (
    <RequireAuth>
      <Suspense fallback={<Cargando />}>
        <AppLayout />
      </Suspense>
    </RequireAuth>
  )
}

/** Array exportado para verificación en tests smoke. */
export const routes: RouteObject[] = [
  { path: '/login', element: <Suspense fallback={<Cargando />}><LoginPage /></Suspense> },
  { path: '/cambio-password', element: <Suspense fallback={<Cargando />}><CambioPasswordPage /></Suspense> },
  {
    path: '/',
    element: <Shell />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'escanear', element: <ScannerPage /> },
      { path: 'inspecciones', element: <ExtinguisherListPage /> },
      { path: 'buscar', element: <ExtinguisherListPage /> },
      { path: 'inspeccion/:tag', element: <InspectionFormPage /> },
      { path: 'planta', element: <PlantaPage /> },
      { path: 'alertas', element: <AlertsPage /> },
      { path: 'exportar', element: <ExportarPage /> },
      { path: 'servidor', element: <ConfigurarServidorPage /> },
      { path: 'export', element: <ExportPage /> },
      { path: 'admin', element: <AdminSettingsPage /> },
      { path: 'importar-terreno', element: <ImportarTerrenoPage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
]

/** Crear el router solo en navegador (los tests smoke node --test importan `routes` sin DOM). */
export function crearRouter() {
  // DEMO (file://): hash router — pushState de rutas no funciona fiable desde file://.
  return DEMO_MODE ? createHashRouter(routes) : createBrowserRouter(routes)
}
