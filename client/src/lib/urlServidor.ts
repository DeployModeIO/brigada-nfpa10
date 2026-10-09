/**
 * Validadores PUROS de la URL del servidor (pantalla «Configurar servidor» y api.ts).
 * Módulo NEUTRO: sin imports (nada de Capacitor/offline) para que api.ts, la pantalla y
 * los tests puedan usarlos sin crear ciclos.
 */

/**
 * Valida que un texto tenga forma de URL de servidor http(s)://host[:puerto][/ruta].
 * Helper PURO (testeable en node): exige esquema http/https y un hostname parseable.
 */
export function esUrlServidorValida(valor: string | null | undefined): boolean {
  if (typeof valor !== 'string') return false
  const s = valor.trim()
  if (!/^https?:\/\//i.test(s)) return false
  try {
    const u = new URL(s)
    return Boolean(u.hostname)
  } catch {
    return false
  }
}

/**
 * Normaliza la URL del servidor para el contrato del cliente (base + /api/v1):
 * recorta espacios y barras finales y añade el sufijo /api/v1 si no lo lleva.
 */
export function normalizarUrlServidor(valor: string): string {
  let s = (valor ?? '').trim().replace(/\/+$/, '')
  if (s && !/\/api\/v\d+$/i.test(s)) s = `${s}/api/v1`
  return s
}

/**
 * ¿La URL es http:// (texto en claro) hacia un host PÚBLICO (fuera de la red local)?
 * Local = localhost/loopback, IP privada RFC1918 (10/8, 172.16/12, 192.168/16) o
 * link-local 169.254/16. Un dominio público o una IP pública por http ⇒ true (aviso
 * de «tráfico en claro fuera de la red local»). Inválida ⇒ false (no avisar dos veces).
 */
export function esHttpPublicoInseguro(valor: string | null | undefined): boolean {
  if (typeof valor !== 'string') return false
  const s = valor.trim()
  if (!/^http:\/\//i.test(s)) return false
  let h: string
  try {
    h = new URL(s).hostname.toLowerCase()
  } catch {
    return false
  }
  if (!h) return false
  if (h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '[::1]') return false
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.localdomain')) return false
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (m) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a === 10 || a === 127) return false
    if (a === 172 && b >= 16 && b <= 31) return false
    if (a === 192 && b === 168) return false
    if (a === 169 && b === 254) return false
    return true
  }
  // Dominio público o IPv6 literal ⇒ fuera de la red local.
  return true
}
