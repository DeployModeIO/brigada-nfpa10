/**
 * Cliente HTTP del contrato NFPA-10. baseURL: VITE_API_URL; si no está definida,
 * MISMO ORIGEN (window.location.origin + /api/v1) — así el despliegue local funciona
 * en cualquier host/puerto de la faena (docker :3200, portable :8080, dev :5199 con
 * proxy /api). En file:// (demo) cae al default histórico; el mock demo intercepta igual.
 * Token en localStorage; 401 → logout global (evento 'nfpa:unauthorized' que escucha AuthContext).
 */
import { installDemoFetch } from './demoMock'

export * from './types'

const TOKEN_KEY = 'nfpa_token'

function env(): Record<string, string | undefined> {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {}
}

function mismaOrigenApi(): string {
  try {
    const o = globalThis.window?.location?.origin
    if (o && /^https?:\/\//.test(o)) return `${o}/api/v1`
  } catch { /* file://, node, SSR */ }
  return 'http://localhost:3200/api/v1'
}

export const API_BASE: string = env().VITE_API_URL ?? mismaOrigenApi()

/** MODO DEMO (VITE_DEMO==='1' en el build): todo fetch hacia API_BASE lo resuelve demoMock. */
export const DEMO_MODE: boolean = env().VITE_DEMO === '1'

if (DEMO_MODE) installDemoFetch(API_BASE)

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  detail: unknown
  constructor(status: number, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

export interface RequestOpts {
  body?: unknown
  headers?: Record<string, string>
  signal?: AbortSignal
}

async function request<T>(method: string, path: string, opts: RequestOpts = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers }
  const token = getToken()
  if (token && !headers.Authorization) headers.Authorization = `Bearer ${token}`
  if (opts.body !== undefined && !headers['Content-Type']) headers['Content-Type'] = 'application/json'

  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
    })
  } catch (e) {
    throw new ApiError(0, 'Sin conexión con el servidor', e)
  }

  const p0 = path.split('?')[0]
  if (res.status === 401) {
    // Gate A1 client: login y cambio de clave muestran el msg del server sin logout global.
    if (p0 === '/auth/login' || p0 === '/auth/change-password') {
      const body = (await res.json().catch(() => null)) as { msg?: string; message?: string } | null
      const def = p0 === '/auth/change-password' ? 'La contraseña actual no coincide' : 'Credenciales incorrectas'
      throw new ApiError(401, body?.msg || body?.message || def, body ?? undefined)
    }
    clearToken()
    window.dispatchEvent(new Event('nfpa:unauthorized'))
    throw new ApiError(401, 'Sesión expirada')
  }

  const text = await res.text()
  let data: unknown = null
  if (text) {
    try {
      data = JSON.parse(text)
    } catch {
      data = text
    }
  }
  // A1 (gate server must_change_password): 403 password_change_required → limpiar token y
  // encauzar a /cambio-password (RequireAuth escucha el evento). /auth/change-password queda
  // excluida para no re-disparar el gate desde la propia página de cambio (sin bucles).
  if (
    res.status === 403 &&
    p0 !== '/auth/change-password' &&
    data &&
    typeof data === 'object' &&
    (data as { error?: unknown }).error === 'password_change_required'
  ) {
    clearToken()
    window.dispatchEvent(new Event('nfpa:password-required'))
  }

  if (!res.ok) {
    const obj = data && typeof data === 'object' ? (data as { message?: unknown; msg?: unknown }) : null
    const msg =
      obj?.message != null ? String(obj.message) : obj?.msg != null ? String(obj.msg) : `Error HTTP ${res.status}`
    throw new ApiError(res.status, msg, data)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, opts?: RequestOpts) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOpts) => request<T>('POST', path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOpts) =>
    request<T>('PUT', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOpts) => request<T>('PATCH', path, { ...opts, body }),
  del: <T>(path: string, opts?: RequestOpts) => request<T>('DELETE', path, opts),
  request,
}
