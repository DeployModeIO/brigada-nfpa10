/** Normaliza el contenido de un QR de etiqueta al tag canónico del backend. */
const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/

/** Acepta tag plano, URL con /inspeccion/<tag> o `nfpa-tag:<tag>`. */
export function extraerTag(texto: string): string | null {
  const t = (texto || '').trim()
  if (!t) return null
  const url = t.match(/inspeccion[=/]([A-Za-z0-9][A-Za-z0-9_-]{1,31})/i)
  if (url) return url[1].toUpperCase()
  const pref = t.match(/^nfpa-tag:([A-Za-z0-9][A-Za-z0-9_-]{1,31})$/i)
  if (pref) return pref[1].toUpperCase()
  if (TAG_RE.test(t)) return t.toUpperCase()
  return null
}

export function esTagValido(texto: string): boolean {
  return TAG_RE.test(texto.trim())
}
