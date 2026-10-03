/**
 * BUILD DEMO USB — un único HTML autocontenido (dist-demo/index.html → Brigada-Demo.html)
 * que se abre con doble clic desde file:// sin servidor ni internet.
 *   - base './' + vite-plugin-singlefile: todo el JS/CSS queda inlined en el HTML.
 *   - mode 'demo' carga .env.demo (VITE_DEMO=1) → api.ts enruta todo a src/lib/demoMock.ts.
 *   - publicDir:false y plugin `sinAssetsExternos`: se eliminan del HTML los <link> de
 *     manifest/iconos (apuntarían a archivos que no viajan en el USB → errores de consola).
 */
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

function sinAssetsExternos(): Plugin {
  return {
    name: 'brigada-demo-sin-assets-externos',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/\s*<link rel="manifest"[^>]*\/?>(\s*\n)?/gi, '\n')
        .replace(/\s*<link rel="icon"[^>]*\/?>(\s*\n)?/gi, '\n')
        .replace(/\s*<link rel="apple-touch-icon"[^>]*\/?>(\s*\n)?/gi, '\n')
    },
  }
}

export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [react(), tailwindcss(), sinAssetsExternos(), viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist-demo',
    emptyOutDir: true,
    sourcemap: false,
    cssCodeSplit: false,
    assetsInlineLimit: 100_000_000,
    reportCompressedSize: false,
  },
})
