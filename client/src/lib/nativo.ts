/**
 * Puente NATIVO opcional (Capacitor) con degradación limpia a la web.
 *
 * Regla de oro: TODAS las importaciones de plugins de Capacitor son DINÁMICAS y van
 * envueltas en try/catch. Así el bundle web no carga nada nativo, los tests en Node no
 * ejecutan plugins y, si un plugin no está disponible (web de escritorio, permisos
 * denegados, dispositivo sin sensor), se cae al camino web existente sin romper nada.
 */

/** Forma mínima que necesitamos del núcleo de Capacitor (evita acoplarnos a sus tipos). */
interface CapacitorCore {
  Capacitor?: {
    isNativePlatform?: () => boolean
    getPlatform?: () => string
  }
}

/** true solo cuando la app corre empaquetada como APK/IPA (plataforma nativa). */
export async function esNativo(): Promise<boolean> {
  try {
    const mod = (await import('@capacitor/core')) as unknown as CapacitorCore
    return Boolean(mod?.Capacitor?.isNativePlatform?.())
  } catch {
    return false
  }
}

/**
 * Lee la base de API guardada en el dispositivo (plugin Preferences, clave 'apiBase').
 * Solo tiene sentido en nativo; en web/nodo devuelve null (el build usa VITE_API_URL).
 */
export async function leerApiBaseGuardada(): Promise<string | null> {
  try {
    const mod = (await import('@capacitor/preferences')) as unknown as {
      Preferences?: { get: (o: { key: string }) => Promise<{ value: string | null }> }
    }
    const p = mod?.Preferences
    if (!p?.get) return null
    const r = await p.get({ key: 'apiBase' })
    const v = (r?.value ?? '').trim()
    return v || null
  } catch {
    return null
  }
}

/** Ubicación normalizada (misma forma que usa el formulario de inspección). */
export interface Ubicacion {
  lat: number
  lng: number
  precision: number
}

/** Pide permiso de ubicación al plugin nativo; false si no hay plugin o lo deniegan. */
export async function pedirPermisoUbicacion(): Promise<boolean> {
  try {
    const mod = (await import('@capacitor/geolocation')) as unknown as {
      Geolocation?: { requestPermissions: () => Promise<{ location?: string }> }
    }
    const g = mod?.Geolocation
    if (!g?.requestPermissions) return false
    const res = await g.requestPermissions()
    return res?.location === 'granted'
  } catch {
    return false
  }
}

/** Camino WEB puro (navigator.geolocation) envuelto en promesa, con los mismos mensajes. */
function obtenerUbicacionWeb(): Promise<Ubicacion> {
  return new Promise<Ubicacion>((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Este navegador no ofrece geolocalización.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy }),
      (err) => reject(new Error(err.message || 'No se pudo obtener la ubicación')),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 },
    )
  })
}

/**
 * Ubicación con preferencia NATIVA: usa @capacitor/geolocation cuando estamos en APK
 * (pide permiso y lee posición); en cualquier otro caso cae a navigator.geolocation.
 */
export async function obtenerUbicacion(): Promise<Ubicacion> {
  if (await esNativo()) {
    try {
      const mod = (await import('@capacitor/geolocation')) as unknown as {
        Geolocation?: {
          requestPermissions: () => Promise<{ location?: string }>
          getCurrentPosition: (o?: {
            enableHighAccuracy?: boolean
            timeout?: number
            maximumAge?: number
          }) => Promise<{ coords: { latitude: number; longitude: number; accuracy: number } }>
        }
      }
      const g = mod?.Geolocation
      if (g?.getCurrentPosition) {
        try {
          await g.requestPermissions()
        } catch {
          /* permiso ya concedido o plugin que decide por sí mismo */
        }
        const pos = await g.getCurrentPosition({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 30_000 })
        return { lat: pos.coords.latitude, lng: pos.coords.longitude, precision: pos.coords.accuracy }
      }
    } catch {
      /* plugin no disponible → degradar a web */
    }
  }
  return obtenerUbicacionWeb()
}

/**
 * Escaneo QR NATIVO con @capacitor/barcode-scanner. Devuelve el texto leído o null si
 * no hay plugin, el usuario cancela o no detecta código (entonces el llamador puede
 * seguir con el camino jsQR de la web). Nunca lanza.
 */
export async function escanearNativo(): Promise<string | null> {
  try {
    const mod = (await import('@capacitor/barcode-scanner')) as unknown as {
      CapacitorBarcodeScanner?: {
        scanBarcode: (o: Record<string, unknown>) => Promise<{ ScanResult?: string } | string | null>
      }
      CapacitorBarcodeScannerTypeHint?: { QR_CODE: unknown }
      CapacitorBarcodeScannerCameraDirection?: { BACK: number }
      CapacitorBarcodeScannerScanOrientation?: { ADAPTIVE: number }
    }
    const b = mod?.CapacitorBarcodeScanner
    if (!b?.scanBarcode) return null
    const r = await b.scanBarcode({
      hint: mod?.CapacitorBarcodeScannerTypeHint?.QR_CODE ?? 0,
      scanInstructions: 'Enfoca el código QR de la etiqueta',
      scanButton: false,
      scanText: 'Escanear',
      cameraDirection: mod?.CapacitorBarcodeScannerCameraDirection?.BACK ?? 1,
      scanOrientation: mod?.CapacitorBarcodeScannerScanOrientation?.ADAPTIVE ?? 3,
    })
    const texto = typeof r === 'string' ? r : (r?.ScanResult ?? null)
    return texto && texto.trim() ? texto : null
  } catch {
    return null
  }
}