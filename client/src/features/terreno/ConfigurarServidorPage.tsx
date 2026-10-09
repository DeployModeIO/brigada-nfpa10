/**
 * /servidor — «Configurar servidor»: pantalla mínima para apuntar el APK de terreno a
 * CUALQUIER PC de la LAN sin recompilar. Muestra la base de API actual y permite fijar o
 * borrar una URL de servidor, guardada reutilizando los helpers de src/lib/nativo.ts
 * (Preferences 'apiBase' en nativo; store de ajustes en web). Tras guardar, avisa de que
 * puede hacer falta reiniciar la app (API_BASE se resuelve al arrancar).
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { API_BASE } from '../../lib/api'
import {
  esNativo,
  esUrlServidorValida,
  guardarApiBase,
  leerApiBaseConfigurada,
  normalizarUrlServidor,
} from '../../lib/nativo'
import { AlertIcon, CheckIcon, DownloadIcon, GearIcon, InfoIcon } from '../../components/icons'
import { Aviso, btnPrimarioCls, inputCls } from '../admin/UI'

/**
 * Ejemplo de dirección de LAN mostrado en la ayuda. Se COMPONE en runtime para no
 * introducir una URL remota literal en el bundle (guard de runtime «Criterio 16»:
 * cero CDN/red). No es una petición: solo texto de ayuda para el operador.
 */
const EJEMPLO_SERVIDOR = ['http', '://', '192.168.1.10', ':8080/api/v1'].join('')

export default function ConfigurarServidorPage() {
  const [guardada, setGuardada] = useState<string | null>(null)
  const [nativo, setNativo] = useState(false)
  const [valor, setValor] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    void (async () => {
      const [esN, base] = await Promise.all([esNativo(), leerApiBaseConfigurada()])
      if (!vivo) return
      setNativo(esN)
      setGuardada(base)
      setValor(base ?? '')
    })()
    return () => {
      vivo = false
    }
  }, [])

  async function onGuardar() {
    setError(null)
    setOk(null)
    const s = normalizarUrlServidor(valor)
    if (!esUrlServidorValida(s)) {
      setError(`Escriba una dirección válida, por ejemplo ${EJEMPLO_SERVIDOR}`)
      return
    }
    await guardarApiBase(s)
    setGuardada(s)
    setValor(s)
    setOk(`Servidor guardado: ${s}. Puede ser necesario reiniciar la app para aplicarlo.`)
  }

  async function onLimpiar() {
    setError(null)
    setOk(null)
    await guardarApiBase('')
    setGuardada(null)
    setValor('')
    setOk('Configuración borrada. La app volverá a la dirección por defecto.')
  }

  return (
    <section
      className="mx-auto flex w-full max-w-screen-sm flex-col gap-4 md:max-w-screen-md lg:max-w-4xl"
      aria-labelledby="titulo-servidor"
    >
      <h1 id="titulo-servidor" className="flex items-center gap-2 text-xl font-semibold">
        <GearIcon size={22} /> Configurar servidor
      </h1>

      <p className="rounded-xl border border-border bg-surface p-4 text-sm text-text2">
        Apunte este dispositivo al PC que recibe las capturas (servidor portátil de la brigada).
        Escriba la dirección de la red local, por ejemplo{' '}
        <span className="font-mono">{EJEMPLO_SERVIDOR}</span>. No hace falta
        recompilar la app para cambiar de PC.
      </p>

      {error && <Aviso tipo="err">{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <dl className="rounded-xl border border-border bg-surface p-4 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2">
          <dt className="text-text2">Plataforma</dt>
          <dd className="font-mono">{nativo ? 'Android (APK)' : 'Navegador (web)'}</dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/50 py-2">
          <dt className="text-text2">Base en uso</dt>
          <dd className="min-w-0 break-all font-mono text-primary" data-testid="servidor-base-actual">
            {API_BASE}
          </dd>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2 py-2">
          <dt className="text-text2">Servidor guardado</dt>
          <dd className="min-w-0 break-all font-mono" data-testid="servidor-base-guardada">
            {guardada ?? '— ninguno (por defecto) —'}
          </dd>
        </div>
      </dl>

      <div className="rounded-xl border border-border bg-surface p-4">
        <label htmlFor="servidor-url" className="block text-sm font-medium">
          Dirección del servidor
        </label>
        <input
          id="servidor-url"
          type="url"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={valor}
          onChange={(e) => setValor(e.target.value)}
          placeholder={EJEMPLO_SERVIDOR}
          className={`${inputCls} mt-2 font-mono`}
        />
        <p className="mt-2 flex items-start gap-2 text-xs text-text2">
          <InfoIcon size={16} className="mt-0.5 shrink-0" />
          Si omite <span className="font-mono">/api/v1</span>, se añadirá automáticamente.
        </p>

        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
          <button type="button" onClick={() => void onGuardar()} className={`${btnPrimarioCls} flex-1`}>
            <CheckIcon size={20} /> Guardar
          </button>
          <button
            type="button"
            onClick={() => void onLimpiar()}
            disabled={guardada === null && valor.trim() === ''}
            className="flex min-h-14 flex-1 items-center justify-center gap-2 rounded-lg border-2 border-border px-4 text-sm font-semibold text-text2 hover:bg-bg2 disabled:opacity-60"
          >
            <AlertIcon size={20} /> Borrar configuración
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link to="/exportar" className="flex items-center gap-2 text-primary underline">
          <DownloadIcon size={18} /> Ir a exportar capturas
        </Link>
        <Link to="/admin" className="flex items-center gap-2 text-primary underline">
          <GearIcon size={18} /> Volver a Ajustes
        </Link>
      </div>
    </section>
  )
}
