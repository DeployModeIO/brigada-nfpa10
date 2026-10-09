/**
 * Cliente HTTP del contrato NFPA-10. baseURL resuelta por resolverApiBase():
 * VITE_API_URL → base guardada en el dispositivo (nativo) → mismo origen (web) →
 * default local histórico. En el APK Capacitor el origen es https://localhost y NO
 * vale como base: por eso el modo nativo usa base explícita o el default documentado.
 * Token en localStorage; 401 → logout global, SALVO en MODO_CAPTURA (sesión permanente
 * de terreno: no se limpia el token ni se dispara 'nfpa:unauthorized').
 */
import { installDemoFetch } from './demoMock'
import { MODO_CAPTURA } from './modo'
import { esNativo, leerApiBaseConfigurada } from './nativo'

export * from './types'
export { esNativo } from './nativo'

const TOKEN_KEY = 'nfpa_token'

/** Default histórico (dev local / docker :3200). En APK sirve vía `adb reverse`. */
const API_BASE_FALLBACK = 'http://localhost:3200/api/v1'

function env(): Record<string, string | undefined> {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {}
}

function origenActual(): string | undefined {
  try {
    return globalThis.window?.location?.origin
  } catch {
    return undefined
  }
}

export interface ResolverApiBaseOpts {
  /** VITE_API_URL del build (máxima prioridad). */
  envUrl?: string
  /** ¿Corremos en plataforma nativa (APK Capacitor)? */
  isNative: boolean
  /** Base guardada en el dispositivo (Preferences 'apiBase'), si la hay. */
  stored?: string | null
  /** window.location.origin actual (solo se usa en web). */
  origin?: string
}

/**
 * Helper PURO y testeable: resuelve la base de la API.
 * Prioridad: envUrl → base guardada → (web: origen + /api/v1) → default local.
 * En nativo, sin env ni base guardada, devuelve el default local (documentado): NO se
 * usa el origen del WebView (https://localhost) porque no es un servidor real. El default
 * local sirve con `adb reverse tcp:3200 tcp:3200`; en LAN real se fija VITE_API_URL o la
 * base guardada (Preferences 'apiBase').
 */
export function resolverApiBase(opts: ResolverApiBaseOpts): string {
  const envUrl = (opts.envUrl ?? '').trim()
  if (envUrl) return envUrl
  const stored = (opts.stored ?? '').trim()
  if (stored) return stored
  if (!opts.isNative) {
    const o = opts.origin
    if (o && /^https?:\/\//.test(o)) return `${o}/api/v1`
  }
  return API_BASE_FALLBACK
}

// Inicialización SÍNCRONA con la misma semántica previa (web idéntica). La detección nativa
// (async) actualiza API_BASE después mediante inicializarApiBase().
export let API_BASE: string = resolverApiBase({
  envUrl: env().VITE_API_URL,
  isNative: false,
  stored: null,
  origin: origenActual(),
})

/**
 * Detección nativa diferida: importa @capacitor/core de forma guardada, lee la base
 * guardada (Preferences 'apiBase') y recalcula API_BASE. En web el resultado es el mismo
 * de siempre. Se invoca una vez al arrancar (main.tsx).
 */
export async function inicializarApiBase(): Promise<string> {
  const isNative = await esNativo()
  // A0: base configurable (Preferences en nativo, store de ajustes en web). Si no hay
  // valor guardado, la resolución sigue exactamente igual que antes (env/origen/default).
  const stored = await leerApiBaseConfigurada()
  API_BASE = resolverApiBase({ envUrl: env().VITE_API_URL, isNative, stored, origin: origenActual() })
  return API_BASE
}

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
    // MODO_CAPTURA: sesión PERMANENTE de terreno. No se invalida el login aunque el server
    // no responda con 200 (token caducado, base aún no configurada…): el usuario sigue dentro
    // y las capturas van a la cola local. Fuera de captura, comportamiento online intacto.
    if (MODO_CAPTURA) {
      throw new ApiError(401, 'Sesión no verificada (modo captura)')
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