/**
 * Cliente HTTP del contrato NFPA-10. baseURL: VITE_API_URL (default http://localhost:3200/api/v1).
 * Token en localStorage; 401 → logout global (evento 'nfpa:unauthorized' que escucha AuthContext).
 */
import { installDemoFetch } from './demoMock'

export * from './types'

const TOKEN_KEY = 'nfpa_token'

function env(): Record<string, string | undefined> {
  return ((import.meta as unknown as { env?: Record<string, string | undefined> }).env) ?? {}
}

export const API_BASE: string = env().VITE_API_URL ?? 'http://localhost:3200/api/v1'

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

  if (res.status === 401) {
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
  if (!res.ok) {
    const msg =
      data && typeof data === 'object' && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Error HTTP ${res.status}`
    throw new ApiError(res.status, msg, data)
  }
  return data as T
}

export const api = {
  get: <T>(path: string, opts?: RequestOpts) => request<T>('GET', path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOpts) => request<T>('POST', path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOpts) => request<T>('PATCH', path, { ...opts, body }),
  del: <T>(path: string, opts?: RequestOpts) => request<T>('DELETE', path, opts),
  request,
}
