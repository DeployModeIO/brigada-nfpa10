import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const swPath = fileURLToPath(new URL('./src/service-worker.js', import.meta.url))

// Build ID: cambia en cada arranque de vite (dev) y en cada build (prod). vite.define NO llega
// a un asset emitido en crudo, por eso se sustituye el placeholder __BUILD_ID__ en el propio texto.
const BUILD_ID = String(Date.now())
const swConVersion = () => readFileSync(swPath, 'utf8').replaceAll('__BUILD_ID__', JSON.stringify(BUILD_ID))

// Service worker manual sin workbox: se sirve en dev vía middleware y se emite como asset en build.
function serviceWorker(): Plugin {
  return {
    name: 'brigada-service-worker',
    configureServer(server) {
      server.middlewares.use('/service-worker.js', (_req, res) => {
        res.setHeader('Content-Type', 'text/javascript; charset=utf-8')
        res.end(swConVersion())
      })
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'service-worker.js', source: swConVersion() })
    },
  }
}

// REGLA CRÍTICA (pantalla blanca en producción, incidente 09/10/2026): un paquete CJS y
// TODO su árbol de dependencias runtime deben caer en el MISMO chunk. Partir el grafo
// require() de un módulo CommonJS entre chunks rompe su inicialización inter-chunk
// («Cannot set properties of undefined (setting 'exports')» desde dijkstrajs) y React
// nunca monta. Por eso pdfmake y xlsx (CJS con árboles anchos: @foliojs-fork/pdfkit,
// iconv-lite, xmldoc, cfb, codepage, ssf…) NO se parten: van al vendor común. Las reglas
// dep-* solo agrupan paquetes autocontenidos (sin dependencias runtime fuera del grupo).
// Correcto > granular: ante la duda, colapsar la división.
function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return
  // Árbol CJS completo de qrcode (qrcode → dijkstrajs, encode-utf8, pngjs) en UN chunk.
  if (/[\\/]node_modules[\\/](qrcode|dijkstrajs|encode-utf8|pngjs)[\\/]/.test(id)) return 'dep-qrcode'
  if (/[\\/]node_modules[\\/]jsqr[\\/]/.test(id)) return 'dep-jsqr' // sin deps runtime
  if (/[\\/]node_modules[\\/]@tanstack[\\/]/.test(id)) return 'dep-virtual' // react-virtual + virtual-core
  if (/[\\/]node_modules[\\/]idb[\\/]/.test(id)) return 'dep-idb' // sin deps runtime
  return 'vendor'
}

export default defineConfig({
  plugins: [react(), tailwindcss(), serviceWorker()],
  server: {
    port: 5199,
    strictPort: true,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3200', changeOrigin: true },
      '/public-config': { target: 'http://localhost:3200', changeOrigin: true },
    },
  },
  // El preview (:4173) sirve el dist real con el SW; proxy /api igual que dev para no depender
  // de que ALLOW_ORIGIN del server incluya el puerto de preview.
  preview: {
    port: 4173,
    strictPort: true,
    host: true,
    proxy: {
      '/api': { target: 'http://localhost:3200', changeOrigin: true },
      '/public-config': { target: 'http://localhost:3200', changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    sourcemap: false,
    rollupOptions: { output: { manualChunks } },
  },
})
