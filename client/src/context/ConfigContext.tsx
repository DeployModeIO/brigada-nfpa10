import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, API_BASE, type PublicConfig } from '../lib/api'
import { setSetting } from '../lib/offline'
import { useTheme } from './ThemeContext'

export const APP_NAME_DEFAULT = 'Brigada NFPA-10'

export interface ConfigContextValue {
  config: PublicConfig
  cargando: boolean
}

const ConfigContext = createContext<ConfigContextValue | null>(null)

const CONFIG_DEFAULT: PublicConfig = { appName: APP_NAME_DEFAULT }

/** Aplica el brand (logo/colores de empresa) sobrescribiendo las CSS vars de tokens.css. */
export function aplicarBrand(brand: Record<string, string> | null | undefined): void {
  if (!brand) return
  const raiz = document.documentElement
  for (const [k, v] of Object.entries(brand)) {
    const nombre = k.startsWith('--') ? k : `--${k}`
    raiz.style.setProperty(nombre, v)
  }
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>(CONFIG_DEFAULT)
  const [cargando, setCargando] = useState(true)
  const { setTema } = useTheme()

  useEffect(() => {
    let vivo = true
    // espejo de la baseURL para el service worker (drain de cola)
    void setSetting('apiBase', API_BASE).catch(() => {})
    api
      .get<PublicConfig>('/public-config')
      .then((c) => {
        if (!vivo || !c) return
        setConfig(c)
        aplicarBrand(c.brand)
        if (c.brand?.bg) {
          document.querySelector('meta[name="theme-color"]')?.setAttribute('content', c.brand.bg)
        }
        // tema por defecto de la empresa solo si el usuario no ha elegido uno
        const elegido = (() => {
          try {
            return localStorage.getItem('nfpa_tema')
          } catch {
            return null
          }
        })()
        if (!elegido && c.temaDefault) setTema(c.temaDefault)
      })
      .catch(() => {
        /* sin backend: mantener defaults */
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
  }, [setTema])

  const value = useMemo(() => ({ config, cargando }), [config, cargando])
  return <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
}

export function useConfig(): ConfigContextValue {
  const ctx = useContext(ConfigContext)
  if (!ctx) throw new Error('useConfig debe usarse dentro de <ConfigProvider>')
  return ctx
}
