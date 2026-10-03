/** Rol de la sesión. /auth/me no existe en el backend real, así que se decodifica el JWT. */
export function rolDesdeToken(token: string | null | undefined): string | null {
  if (!token) return null
  const partes = token.split('.')
  if (partes.length !== 3) return null
  try {
    const b64 = partes[1].replace(/-/g, '+').replace(/_/g, '/')
    const payload = JSON.parse(atob(b64)) as { rol?: string; exp?: number }
    if (payload.exp && payload.exp * 1000 < Date.now()) return null
    return payload.rol ?? null
  } catch {
    return null
  }
}
