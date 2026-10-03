/** Compresión de evidencia: File → dataURL → canvas (máx 1024 px lado, JPEG 0.7) → base64 puro. */

export interface FotoComprimida {
  dataUrl: string
  base64: string
  ancho: number
  alto: number
  pesosChars: number
}

const LADO_MAX = 1024
const CALIDAD = 0.7

function leerComoDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader()
    fr.onload = () => resolve(String(fr.result))
    fr.onerror = () => reject(new Error('No se pudo leer la imagen.'))
    fr.readAsDataURL(file)
  })
}

function cargarImagen(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('El archivo no es una imagen legible.'))
    img.src = dataUrl
  })
}

export async function comprimirImagen(file: File): Promise<FotoComprimida> {
  const crudo = await leerComoDataUrl(file)
  const img = await cargarImagen(crudo)
  const escala = Math.min(1, LADO_MAX / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * escala))
  const h = Math.max(1, Math.round(img.naturalHeight * escala))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible en este navegador.')
  ctx.drawImage(img, 0, 0, w, h)
  const dataUrl = canvas.toDataURL('image/jpeg', CALIDAD)
  const coma = dataUrl.indexOf(',')
  const base64 = coma >= 0 ? dataUrl.slice(coma + 1) : dataUrl
  return { dataUrl, base64, ancho: w, alto: h, pesosChars: base64.length }
}
