/**
 * Integración empresarial: webhookUrl + API key (PATCH /settings) y prueba manual
 * POST /alerts/webhook-test con feedback del status real de n8n/ERP.
 */
import { useEffect, useState } from 'react'
import { api, ApiError } from '../../lib/api'
import { AlertIcon } from '../../components/icons'
import { Aviso, btnPrimarioCls, inputCls } from './UI'
import type { SettingsReal } from './tipos'

export default function WebhookSection({ settings, esAdmin, onGuardado }: { settings: SettingsReal | null; esAdmin: boolean; onGuardado: (s: SettingsReal) => void }) {
  const [webhookUrl, setWebhookUrl] = useState('')
  const [webhookApi, setWebhookApi] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [probando, setProbando] = useState(false)
  const [ok, setOk] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [prueba, setPrueba] = useState<{ status: number; texto: string; exito: boolean } | null>(null)

  useEffect(() => {
    setWebhookUrl(settings?.webhookUrl ?? '')
    setWebhookApi(settings?.webhookApi ?? '')
  }, [settings])

  const lectura = !esAdmin

  async function guardar() {
    setGuardando(true)
    setError(null)
    setOk(null)
    try {
      const resp = await api.patch<SettingsReal>('/settings', { webhookUrl: webhookUrl.trim(), webhookApi: webhookApi.trim() })
      onGuardado(resp)
      setOk('Integración guardada en el servidor.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la integración.')
    } finally {
      setGuardando(false)
    }
  }

  async function probar() {
    setProbando(true)
    setPrueba(null)
    setError(null)
    try {
      const resp = await api.post<{ ok: boolean; status: number }>('/alerts/webhook-test')
      setPrueba({ status: resp.status ?? 200, texto: `El webhook de la empresa respondió ${resp.status ?? 200} (entrega exitosa).`, exito: true })
    } catch (e) {
      if (e instanceof ApiError) {
        const detail = e.detail as { msg?: string; error?: string } | null
        const msg = detail?.msg ?? e.message
        setPrueba({
          status: e.status,
          texto:
            e.status === 400
              ? `400 — ${msg}. Configure y guarde la URL primero.`
              : `El servidor intentó entregar y la empresa respondió: ${msg} (status ${e.status}). Conectividad HTTP correcta si n8n respondió.`,
          exito: false,
        })
      } else {
        setError(e instanceof Error ? e.message : 'No se pudo probar el webhook.')
      }
    } finally {
      setProbando(false)
    }
  }

  return (
    <fieldset className="min-w-0 rounded-xl border border-border bg-surface p-4" disabled={guardando}>
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-text2">
        <AlertIcon size={18} /> Integración empresarial (n8n / ERP)
      </legend>
      {lectura && (
        <p className="mb-2 text-xs text-text2" role="note">
          Vista de solo lectura: probar y editar la integración requiere rol admin.
        </p>
      )}
      {error && <Aviso tipo="err">{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="hook-url" className="block text-xs font-medium text-text2">
            URL del webhook
          </label>
          <input
            id="hook-url"
            type="url"
            inputMode="url"
            placeholder="http://127.0.0.1:5678/webhook/nfpa-test"
            className={inputCls}
            value={webhookUrl}
            readOnly={lectura}
            disabled={lectura}
            onChange={(e) => setWebhookUrl(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="hook-key" className="block text-xs font-medium text-text2">
            API key (header X-API-Key)
          </label>
          <input
            id="hook-key"
            type="text"
            autoComplete="off"
            placeholder="clave compartida con n8n/ERP"
            className={inputCls}
            value={webhookApi}
            readOnly={lectura}
            disabled={lectura}
            onChange={(e) => setWebhookApi(e.target.value)}
          />
        </div>
      </div>

      {prueba && (
        <p
          role="status"
          aria-live="polite"
          className={`mt-3 rounded-lg border px-3 py-2 font-mono text-sm ${prueba.exito ? 'border-ok bg-ok/10 text-ok' : 'border-warn bg-warn/10 text-warn'}`}
        >
          {prueba.texto}
        </p>
      )}

      {!lectura && (
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" disabled={guardando} onClick={() => void guardar()} className={btnPrimarioCls}>
            {guardando ? 'Guardando…' : 'Guardar integración'}
          </button>
          <button
            type="button"
            disabled={probando || !webhookUrl.trim()}
            aria-busy={probando}
            onClick={() => void probar()}
            className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-info px-4 text-sm font-semibold text-info hover:bg-bg2 disabled:opacity-60"
          >
            {probando ? 'Probando…' : 'Probar webhook'}
          </button>
        </div>
      )}

      <p className="mt-3 text-xs text-text2">
        Conecta con n8n/ERP: el servidor envía eventos «vencidos_detectados» (job periódico) e «inspeccion_con_fallas» (alta de
        inspección) como POST JSON {`{evento, data, ts}`} con el header X-API-Key. La entrega es fail-silent: si la empresa no
        responde, la app sigue funcionando.
      </p>
    </fieldset>
  )
}
