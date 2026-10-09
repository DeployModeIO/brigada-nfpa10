/**
 * Configuración de Capacitor para el APK de terreno (banda ancha de campo).
 * El dispositivo habla con el servidor portátil del PC por la LAN (http) mientras
 * la app corre en un WebView con esquema https://localhost — ver client/CAPACITOR.md.
 * allowMixedContent está habilitado SOLO para el TEST DE CAMPO: la web se sirve por https
 * y las llamadas van a un servidor http de la red local. Con esto el contenido mixto queda
 * permitido y, por tanto, el Bearer token viaja EN CLARO. Es de uso en campo (LAN de
 * confianza), nunca exposición pública: en PRODUCCIÓN debe servirse por HTTPS y
 * allowMixedContent debe ponerse en false. Ver client/CAPACITOR.md §7 y docs/DEPLOY.md §7.
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
    // TEST/PRUEBA DE CAMPO únicamente (servidor http en la LAN). PRODUCCIÓN con HTTPS:
    // poner en false para no permitir contenido mixto (el token viajaría en claro).
    allowMixedContent: true,
  },
}

export default config