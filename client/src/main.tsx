import React from 'react'
import ReactDOM from 'react-dom/client'
import { RouterProvider } from 'react-router-dom'
import './styles/global.css'
import { AuthProvider } from './context/AuthContext'
import { ConfigProvider } from './context/ConfigContext'
import { ThemeProvider } from './context/ThemeContext'
import { crearRouter } from './router'
import { DEMO_MODE } from './lib/api'
import { drainQueue } from './lib/offline'

interface RegistrationWithSync extends ServiceWorkerRegistration {
  sync?: { register: (tag: string) => Promise<void> }
}

function pedirSyncSW(): void {
  if (!('serviceWorker' in navigator)) return
  navigator.serviceWorker
    .getRegistration()
    .then((r) => (r as RegistrationWithSync | undefined)?.sync?.register('nfpa-sync'))
    .catch(() => {})
}

// En MODO DEMO (file://) no hay cola offline ni service worker: la persistencia la da demoMock.
if (!DEMO_MODE) {
  // Al recuperar conexión: la app drena la cola y también avisa al SW (por si estaba cerrada).
  window.addEventListener('online', () => {
    void drainQueue().catch(() => {})
    pedirSyncSW()
  })
  if (navigator.onLine) void drainQueue().catch(() => {})
}

// FIX "marca solo en oscuro": en DEV no debe haber service worker. Con cache-first + nombre de
// caché fijo, un SW residual sirve módulos /src obsoletos (el navegador ejecuta código anterior
// al fix aunque el disco ya tenga el cambio; verificado con Playwright). Además desregistramos
// cualquier SW heredado de sesiones previas: su nuevo /service-worker.js (con caché versionada)
// purga la caché vieja al activarse y auto-sana el navegador. En PROD el SW sigue igual:
// offline/cola de inspecciones intacta (drain on-online y sync 'nfpa-sync' en service-worker.js).
// DEMO: nunca registrar — file:// no permite SW y la BD vive en localStorage.
if (!DEMO_MODE && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    if (import.meta.env.DEV) {
      navigator.serviceWorker
        .getRegistrations()
        .then((rs) => {
          rs.forEach((r) => r.unregister())
          return caches.keys()
        })
        // unregister NO borra CacheStorage: purgamos también los restos brigada-* del SW heredado
        .then((ks) => Promise.all(ks.filter((k) => k.startsWith('brigada-')).map((k) => caches.delete(k))))
        .catch(() => {})
      return
    }
    navigator.serviceWorker.register('/service-worker.js', { scope: '/' }).catch(() => {
      /* registro fallido: la app sigue funcionando */
    })
  })
}

const router = crearRouter()

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <ThemeProvider>
      <ConfigProvider>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </ConfigProvider>
    </ThemeProvider>
  </React.StrictMode>,
)
