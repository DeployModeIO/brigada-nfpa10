import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { api, clearToken, getToken, setToken, type Usuario } from '../lib/api'
import { setSetting } from '../lib/offline'

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
    setUsuario({ id: res.user.id, usuario: res.user.username, nombre: res.user.nombre, rol: res.user.rol })
    setTokenState(res.token)
    // Gate A1: con must_change_password=1 el server solo sirve /auth/change-password|/auth/me|/auth/logout.
    const debeCambiarClave = Number(res.user.must_change_password) === 1
    setPasswordRequerida(debeCambiarClave)
    return { debeCambiarClave }
  }, [])

  const logout = useCallback(() => {
    clearToken()
    void setSetting('token', null).catch(() => {})
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
