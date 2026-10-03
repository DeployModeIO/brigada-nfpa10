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

function manualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return
  if (/[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(id)) return 'vendor'
  if (id.includes('jsqr')) return 'dep-jsqr'
  if (id.includes('pdfmake')) return 'dep-pdfmake'
  if (id.includes('xlsx')) return 'dep-xlsx'
  if (id.includes('qrcode') || id.includes('@types/qrcode')) return 'dep-qrcode'
  if (id.includes('@tanstack')) return 'dep-virtual'
  if (id.includes('idb')) return 'dep-idb'
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
