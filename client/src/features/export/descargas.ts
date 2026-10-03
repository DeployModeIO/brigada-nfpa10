/** Utilidades de descarga autenticada (fetch con token → blob → <a download>). */
import { API_BASE, getToken } from '../../lib/api'

export async function descargarConAuth(path: string, nombreArchivo: string): Promise<number> {
  const token = getToken()
  if (!token) throw new Error('Sesión no válida; inicie sesión.')
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`Error HTTP ${res.status} al descargar ${path}`)
  const blob = await res.blob()
  volcar(blob, nombreArchivo)
  return blob.size
}

export function volcar(blob: Blob, nombreArchivo: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

interface Pagina<T> {
  items: T[]
  total: number
  page: number
  size: number
}

/** Recorre todas las páginas de un endpoint paginado devolviendo la lista completa. */
export async function paginadoCompleto<T>(path: string, size = 100): Promise<T[]> {
  const token = getToken()
  if (!token) throw new Error('Sesión no válida; inicie sesión.')
  const salida: T[] = []
  let page = 1
  // techo defensivo: 200 páginas
  for (let i = 0; i < 200; i++) {
    const sep = path.includes('?') ? '&' : '?'
    const res = await fetch(`${API_BASE}${path}${sep}page=${page}&size=${size}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    })
    if (!res.ok) throw new Error(`Error HTTP ${res.status} en ${path}`)
    const data = (await res.json()) as Pagina<T>
    salida.push(...(data.items ?? []))
    if (salida.length >= data.total || (data.items ?? []).length === 0) break
    page++
  }
  return salida
}

export function bytesHumanos(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(2)} MB`
}
