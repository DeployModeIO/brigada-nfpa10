import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, clearToken, getToken, setToken, type Usuario } from '../lib/api'
import { getSetting, setSetting } from '../lib/offline'
import { MODO_CAPTURA, SESION_CAPTURA_DIAS, anclaSesionLegible, sesionCapturaVigente } from '../lib/modo'

interface JwtUserPayload { id: number; username: string; nombre: string; rol: string; must_change_password?: number | boolean }

/** Decodifica el payload del JWT (sin verificar firma: solo para pintar la sesión offline). */
function decodificarToken(tok: string): Usuario | null {
  try {
    const parts = tok.split('.')
    if (parts.length !== 3) return null
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/')
    const p = JSON.parse(atob(b64)) as Partial<JwtUserPayload>
    if (typeof p.id !== 'number' || typeof p.username !== 'string') return null
    return { id: p.id, usuario: p.username, nombre: p.nombre ?? p.username, rol: p.rol ?? '' }
  } catch {
    return null
  }
}

export interface AuthContextValue {
  token: string | null
  usuario: Usuario | null
  cargando: boolean
  autenticado: boolean
  passwordRequerida: boolean
  login: (usuario: string, clave: string) => Promise<{ debeCambiarClave: boolean }>
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** M4: clave IndexedDB (settings) con el inicio ISO de la sesión permanente de captura-local. */
const CLAVE_SESION_CAPTURA = 'sesion_captura_desde'

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setTokenState] = useState<string | null>(() => getToken())
  // fallback inmediato: sesión desde el payload del token guardado (mientras valida /auth/me)
  const [usuario, setUsuario] = useState<Usuario | null>(() => {
    const t = getToken()
    return t ? decodificarToken(t) : null
  })
  const [cargando, setCargando] = useState<boolean>(() => Boolean(getToken()))
  const [passwordRequerida, setPasswordRequerida] = useState(false)

  // 401 desde el cliente HTTP → sesión fuera
  useEffect(() => {
    const onUnauthorized = () => {
      // MODO_CAPTURA: sesión permanente de terreno — se ignora la invalidación global
      // (la base puede cambiar o el server no estar; el usuario no debe re-loguear).
      if (MODO_CAPTURA) return
      setTokenState(null)
      setUsuario(null)
      setPasswordRequerida(false)
    }
    // Gate A1: 403 password_change_required desde el interceptor de api.ts.
    const onPasswordRequired = () => setPasswordRequerida(true)
    window.addEventListener('nfpa:unauthorized', onUnauthorized)
    window.addEventListener('nfpa:password-required', onPasswordRequired)
    return () => {
      window.removeEventListener('nfpa:unauthorized', onUnauthorized)
      window.removeEventListener('nfpa:password-required', onPasswordRequired)
    }
  }, [])

  // Validar token existente al arrancar (best-effort; si el server no responde, deja entrar offline)
  useEffect(() => {
    if (!token) return
    let vivo = true
    api
      .get<{ user: JwtUserPayload }>('/auth/me')
      .then((r) => {
        if (vivo && r?.user) {
          setUsuario({ id: r.user.id, usuario: r.user.username, nombre: r.user.nombre, rol: r.user.rol })
          // El server refresca must_change_password desde BD: cubre flag puesto tras el login.
          setPasswordRequerida(Number(r.user.must_change_password) === 1)
        }
      })
      .catch(() => {
        /* offline o server abajo: mantener el usuario decodificado del token */
      })
      .finally(() => {
        if (vivo) setCargando(false)
      })
    return () => {
      vivo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const login = useCallback(async (usuario: string, clave: string) => {
    const res = await api.post<{
      token: string
      user: { id: number; username: string; nombre: string; rol: string; must_change_password?: number | boolean }
    }>('/auth/login', { username: usuario, password: clave })
    setToken(res.token)
    // espejo en IDB para que el service worker pueda sincronizar la cola
    void setSetting('token', res.token).catch(() => {})
    // M4: en captura-local se ancla el inicio de la sesión permanente si aún no existe.
    if (MODO_CAPTURA) {
      void getSetting<string>(CLAVE_SESION_CAPTURA)
        .then((desde) => (desde == null ? setSetting(CLAVE_SESION_CAPTURA, new Date().toISOString()) : undefined))
        .catch(() => {})
    }
    setUsuario({ id: res.user.id, usuario: res.user.username, nombre: res.user.nombre, rol: res.user.rol })
    setTokenState(res.token)
    // Gate A1: con must_change_password=1 el server solo sirve /auth/change-password|/auth/me|/auth/logout.
    const debeCambiarClave = Number(res.user.must_change_password) === 1
    setPasswordRequerida(debeCambiarClave)
    return { debeCambiarClave }
  }, [])

  // M4: la sesión permanente de captura-local ahora tiene vida máxima (default 30 días,
  // VITE_SESION_DIAS). Se comprueba async contra IndexedDB SIN bloquear el primer render:
  // si al resolver resulta vencida, se limpia la sesión en ese momento (logout) para que
  // el dispositivo re-autentique. Fuera de captura-local no hay caducidad (sin cambios).
  const vencerSesionCaptura = useCallback(() => {
    clearToken()
    void setSetting('token', null).catch(() => {})
    // El ancla muere con la sesión: el próximo login vuelve a anclar el inicio.
    void setSetting(CLAVE_SESION_CAPTURA, null).catch(() => {})
    setUsuario(null)
    setTokenState(null)
    setPasswordRequerida(false)
  }, [])

  useEffect(() => {
    if (!MODO_CAPTURA) return
    let vivo = true
    // M4+ (fast-follow): chequeo reutilizable — al arrancar, al VOLVER a la app
    // (visibilitychange) y al recuperar red (online). El ancla puede vencer con la app
    // en pausa: sin esto el vencimiento solo se vería tras reiniciar el dispositivo.
    const revisar = async () => {
      try {
        const desde = await getSetting<string>(CLAVE_SESION_CAPTURA)
        if (!vivo) return
        if (!anclaSesionLegible(desde)) {
          // Sin ancla (primera corrida o tras un vencimiento) o ancla ilegible:
          // se trata como «ancla ahora» — sesión vigente desde ya, re-anclada.
          await setSetting(CLAVE_SESION_CAPTURA, new Date().toISOString())
          return
        }
        if (!sesionCapturaVigente(desde as string, SESION_CAPTURA_DIAS, Date.now())) vencerSesionCaptura()
      } catch {
        /* IndexedDB no disponible: mantener la sesión (best-effort, igual que hoy) */
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') void revisar()
    }
    void revisar()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', revisar)
    return () => {
      vivo = false
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', revisar)
    }
  }, [vencerSesionCaptura])

  const logout = useCallback(() => {
    clearToken()
    void setSetting('token', null).catch(() => {})
    // M4: el ancla de vigencia de captura-local también muere en el logout manual.
    if (MODO_CAPTURA) void setSetting(CLAVE_SESION_CAPTURA, null).catch(() => {})
    setUsuario(null)
    setTokenState(null)
    setPasswordRequerida(false)
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ token, usuario, cargando, autenticado: Boolean(token), passwordRequerida, login, logout }),
    [token, usuario, cargando, passwordRequerida, login, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}
