/**
 * Integración a la base de datos del CLIENTE FINAL (PRODUCT-LINE.md §NORMA 3).
 * - Herramienta de TEST de conexión: envía driver+URL UNA sola vez al server
 *   (POST /integration/test, admin) que prueba credenciales y lista tablas.
 *   Nada se guarda en el navegador: NO usar password manager ni localStorage aquí.
 * - Estado de INTEGRATION_MODE (off|referencia|espejo) — siempre fijado por ENV del
 *   server, nunca desde el client (seguridad).
 * - Alta masiva desde la REFERENCIA del cliente (POST /integration/ref/:lista/importar).
 * - Editor de mapeos del modo espejo (no contiene credenciales).
 */
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { api, ApiError } from '../../lib/api'
import { CheckIcon, PlugIcon } from '../../components/icons'
import { Aviso, inputCls } from './UI'

interface Mapeo { origen: string; destino: string; columnas: Record<string, string> }

interface EstadoIntegracion {
  mode: 'off' | 'referencia' | 'espejo' | string
  selfDriver: string
  clientDb: { driver: string; url: string | null; configurado: boolean }
  referencia: { activo: boolean; listas: string[] }
  espejo: { activo: boolean; mapeos: Mapeo[]; pendientes: number }
  pendientesNota?: string
}

interface TestResultado {
  ok?: boolean
  dialect?: string
  product?: string
  version?: string
  tables?: string[]
  latencyMs?: number
  error?: string
  msg?: string
}

interface ResultadoImportar {
  ok: boolean
  leidas: number
  creados: number
  actualizados: number
  saltados: number
  errores?: string[]
}

const DRIVERS = ['postgres', 'mysql', 'sqlite', 'sqlserver', 'oracle'] as const

export default function IntegracionSection({ esAdmin, soloLectura }: { esAdmin: boolean; soloLectura: boolean }) {
  const [estado, setEstado] = useState<EstadoIntegracion | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  const [driver, setDriver] = useState<string>('postgres')
  const [url, setUrl] = useState('')
  const [probando, setProbando] = useState(false)
  const [resultado, setResultado] = useState<TestResultado | null>(null)

  const [importando, setImportando] = useState<string | null>(null)

  const [mapeosTxt, setMapeosTxt] = useState('[]')
  const [mapeosErr, setMapeosErr] = useState<string | null>(null)

  const cargar = useCallback(() => {
    api
      .get<EstadoIntegracion>('/integration/status')
      .then((s) => {
        setEstado(s)
        setMapeosTxt(JSON.stringify(s.espejo?.mapeos ?? [], null, 2))
      })
      .catch((e: unknown) => setError(e instanceof ApiError ? String((e.detail as { msg?: string })?.msg ?? e.message) : 'No se pudo leer el estado de integración.'))
  }, [])

  useEffect(cargar, [cargar])

  async function probarConexion(ev: FormEvent) {
    ev.preventDefault()
    setProbando(true)
    setResultado(null)
    setError(null)
    setOk(null)
    try {
      const r = await api.post<TestResultado>('/integration/test', { driver, url })
      setResultado(r)
      setOk(`Conexión exitosa a ${r.dialect} en ${r.latencyMs} ms — ${r.tables?.length ?? 0} tablas visibles`)
    } catch (e) {
      const det = e instanceof ApiError ? (e.detail as TestResultado | null) : null
      setResultado({ error: det?.error ?? 'fallo', msg: det?.msg ?? (e instanceof Error ? e.message : 'Error') })
    } finally {
      setProbando(false)
      // La credencial usada NO queda en pantalla más de lo necesario:
      setUrl('')
    }
  }

  async function importar(nombre: string) {
    setImportando(nombre)
    setError(null)
    setOk(null)
    try {
      const r = await api.post<ResultadoImportar>(`/integration/ref/${encodeURIComponent(nombre)}/importar`, {})
      setOk(`Importación «${nombre}»: ${r.creados} creados, ${r.actualizados} actualizados, ${r.saltados} saltados (de ${r.leidas}).`)
    } catch (e) {
      setError(e instanceof ApiError ? String((e.detail as { msg?: string })?.msg ?? e.message) : 'La importación falló.')
    } finally {
      setImportando(null)
    }
  }

  async function guardarMapeos() {
    setMapeosErr(null)
    setError(null)
    setOk(null)
    let arr: unknown
    try {
      arr = JSON.parse(mapeosTxt)
    } catch (e) {
      setMapeosErr(`JSON inválido: ${e instanceof Error ? e.message : ''}`)
      return
    }
    try {
      const r = await api.put<{ mapeos: Mapeo[] }>('/integration/espejo/mapeos', { mapeos: arr })
      setOk(`Mapeos guardados (${r.mapeos.length}).`)
      cargar()
    } catch (e) {
      setMapeosErr(e instanceof ApiError ? String((e.detail as { msg?: string })?.msg ?? e.message) : 'No se pudieron guardar los mapeos.')
    }
  }

  async function vaciarCola() {
    setError(null)
    try {
      const r = await api.post<{ enviados: number; pendientes: number }>('/integration/espejo/flush', {})
      setOk(`Espejo procesado: ${r.enviados} enviados, ${r.pendientes} pendientes.`)
      cargar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo forzar el espejo.')
    }
  }

  return (
    <fieldset className="rounded-xl border border-border bg-surface p-4" disabled={soloLectura}>
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-text2">
        <PlugIcon size={18} /> Base de datos del cliente
      </legend>

      {error && <Aviso tipo="err">{error}</Aviso>}
      {ok && !error && <Aviso tipo="ok">{ok}</Aviso>}

      {estado ? (
        <div className="mb-3 grid gap-1 text-sm sm:grid-cols-2">
          <p>Modo: <strong className="font-mono">{estado.mode}</strong> <span className="text-xs text-text2">(definido por ENV del server; el client no puede cambiarlo)</span></p>
          <p>Almacén propio: <strong className="font-mono">{estado.selfDriver}</strong> · DB cliente: <strong className="font-mono">{estado.clientDb.driver}{estado.clientDb.configurado ? ` (${estado.clientDb.url ?? 'url oculta'})` : ' (sin configurar)'}</strong></p>
          {estado.mode === 'referencia' && (
            <p>Referencia: {estado.referencia.activo ? `listas disponibles: ${estado.referencia.listas.join(', ') || '(ninguna: configure INTEGRATION_REF_LISTS)'}` : 'requiere CLIENT_DB_URL'}</p>
          )}
          {estado.mode === 'espejo' && (
            <p>Espejo: {estado.espejo.activo ? `cola con ${estado.espejo.pendientes} pendiente(s)` : 'requiere CLIENT_DB_URL'}{estado.espejo.activo && estado.espejo.pendientes > 0 && esAdmin && (
              <button type="button" onClick={() => void vaciarCola()} className="ml-2 min-h-10 rounded-lg border border-primary px-2 text-xs font-semibold text-primary">Procesar ahora</button>
            )}</p>
          )}
        </div>
      ) : (
        <p role="status" className="text-sm text-text2">Consultando estado…</p>
      )}

      {esAdmin && estado?.referencia?.activo && estado.referencia.listas.length > 0 && (
        <div className="mb-3 rounded-lg border border-border bg-bg2 p-3">
          <p className="text-sm font-semibold text-text">Alta masiva desde el inventario del cliente (modo referencia)</p>
          <p className="mt-1 text-xs text-text2">Lee las tablas maestras y crea/actualiza extintores aquí con el mapeo INTEGRATION_IMPORT_MAP — sin doble digitar.</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {estado.referencia.listas.map((l) => (
              <li key={l}>
                <button type="button" disabled={importando !== null} onClick={() => void importar(l)} aria-busy={importando === l} className="min-h-10 rounded-lg bg-primary px-3 text-sm font-semibold text-on-primary disabled:opacity-60">
                  {importando === l ? 'Importando…' : `Importar «${l}»`}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {esAdmin && (
        <form onSubmit={(e) => void probarConexion(e)} noValidate className="mb-4 grid gap-3 rounded-lg border border-border bg-bg2 p-3 sm:grid-cols-[auto_1fr_auto]">
          <div>
            <label htmlFor="int-driver" className="block text-xs text-text2">Driver destino</label>
            <select id="int-driver" className={inputCls} value={driver} onChange={(e) => setDriver(e.target.value)}>
              {DRIVERS.map((d) => (
                <option key={d} value={d}>{d}{d === 'sqlserver' || d === 'oracle' ? ' (pendiente)' : ''}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="int-url" className="block text-xs text-text2">URL de conexión (no se guarda nada)</label>
            <input id="int-url" type="password" autoComplete="off" className={`${inputCls} font-mono`} placeholder="postgres://usuario:clave@servidor-interno:5432/base_cliente" value={url} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={probando || !url.trim()} aria-busy={probando} className="flex min-h-14 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary disabled:opacity-60">
              <CheckIcon size={18} /> {probando ? 'Probando…' : 'Probar conexión'}
            </button>
          </div>
          {resultado && (
            <div className="sm:col-span-3" aria-live="polite">
              {resultado.ok ? (
                <div className="rounded-lg border border-ok/40 p-2 text-sm">
                  <p className="font-semibold text-ok">{resultado.product} {resultado.version} — {resultado.tables?.length ?? 0} tablas ({resultado.latencyMs} ms)</p>
                  <ul className="mt-1 max-h-40 overflow-auto font-mono text-xs text-text2">
                    {(resultado.tables ?? []).slice(0, 200).map((t) => <li key={t}>{t}</li>)}
                  </ul>
                </div>
              ) : (
                <p className="rounded-lg border border-err/40 p-2 text-sm text-err" role="alert">
                  {resultado.error === 'connector_pending' ? '⚠ ' : ''}{resultado.msg ?? 'Conexión fallida'}
                  {resultado.error === 'connector_pending' && ' — es deuda conocida de la línea de productos; contribuciones bienvenidas.'}
                </p>
              )}
            </div>
          )}
        </form>
      )}

      {esAdmin && (
        <details className="rounded-lg border border-border bg-bg2 p-3">
          <summary className="cursor-pointer text-sm font-semibold">Mapeos del modo espejo (JSON: origen local → tabla del cliente)</summary>
          <p className="mt-2 text-xs text-text2">
            Brigada espeja <code className="font-mono">inspecciones</code> y <code className="font-mono">rechazos</code> (órdenes de trabajo). Ejemplo: <code className="font-mono">{'[{"origen":"inspecciones","destino":"faena.reg_inspecciones","columnas":{"tag":"equipo_tag","fecha":"fecha_insp","inspector_username":"usuario"}}]'}</code>
          </p>
          <textarea id="int-mapeos" rows={8} className={`${inputCls} mt-2 font-mono text-xs`} value={mapeosTxt} onChange={(e) => setMapeosTxt(e.target.value)} aria-label="Mapeos de espejo en JSON" />
          {mapeosErr && <p role="alert" className="mt-1 text-xs text-err">{mapeosErr}</p>}
          <button type="button" onClick={() => void guardarMapeos()} className="mt-2 min-h-14 rounded-lg bg-primary px-4 text-sm font-semibold text-on-primary">Guardar mapeos</button>
        </details>
      )}
    </fieldset>
  )
}
