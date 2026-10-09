/**
 * Configuración de Capacitor para el APK de terreno (banda ancha de campo).
 * El dispositivo habla con el servidor portátil del PC por la LAN (http) mientras
 * la app corre en un WebView con esquema https://localhost — ver client/CAPACITOR.md.
 * allowMixedContent es IMPRESCINDIBLE: la web se sirve por https y las llamadas van
 * a un servidor http de la red local. Es de uso en campo (test), no exposición pública.
 */
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'io.deploymodeio.brigada',
  appName: 'Brigada NFPA-10',
  webDir: 'dist',
  // El WebView usa https://localhost (origen estable y seguro). Por eso mismaOrigenApi()
  // NO sirve en nativo: src/lib/api.ts resuelve la base con resolverApiBase().
  server: {
    androidScheme: 'https',
  },
  android: {
    // Servidor de campo por http en la LAN → permitir contenido mixto en el WebView.
    allowMixedContent: true,
  },
}

export default config