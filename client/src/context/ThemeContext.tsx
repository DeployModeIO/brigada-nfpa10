import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

export type Tema = 'light' | 'solarized' | 'dark' | 'read'

export const TEMAS: Tema[] = ['light', 'solarized', 'dark', 'read']
export const TEMA_STORAGE_KEY = 'nfpa_tema'

export const TEMA_ETIQUETA: Record<Tema, string> = {
  light: 'Claro (HMI industrial)',
  solarized: 'Solarized Dark',
  dark: 'Oscuro',
  read: 'Lectura (alto contraste)',
}

/** Ciclo puro light→solarized→dark→read→light (exportado para tests smoke). */
export function proximoTema(actual: Tema): Tema {
  const i = TEMAS.indexOf(actual)
  return TEMAS[(i + 1) % TEMAS.length]
}

function leerTemaInicial(): Tema {
  try {
    const guardado = localStorage.getItem(TEMA_STORAGE_KEY)
    if (guardado && (TEMAS as string[]).includes(guardado)) return guardado as Tema
  } catch {
    /* SSR / sin storage */
  }
  return 'light'
}

export interface ThemeContextValue {
  tema: Tema
  setTema: (t: Tema) => void
  siguienteTema: () => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [tema, setTemaState] = useState<Tema>(leerTemaInicial)

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
    try {
      localStorage.setItem(TEMA_STORAGE_KEY, tema)
    } catch {
      /* ignore */
    }
  }, [tema])

  const setTema = useCallback((t: Tema) => setTemaState(t), [])
  const siguienteTema = useCallback(() => proximoTema(tema), [tema])

  const value = useMemo(() => ({ tema, setTema, siguienteTema }), [tema, setTema, siguienteTema])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}
