/**
 * Marca de empresa: appName, logo (file → dataURL ≤300 KB con aviso), 5 color pickers brand,
 * preview inmediato aplicando CSS vars localmente y botón «Aplicar a todos los temas»
 * (PATCH /settings + aplicarBrand global sobre :root, que gana a [data-theme]).
 */
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { api } from '../../lib/api'
import { aplicarBrand, useConfig } from '../../context/ConfigContext'
import { GearIcon } from '../../components/icons'
import { Aviso, btnPrimarioCls, inputCls } from './UI'
import type { SettingsReal } from './tipos'

const MAX_LOGO_BYTES = 300 * 1024
const CAMPOS_BRAND = ['primary', 'ok', 'warn', 'err', 'info'] as const
type CampoBrand = (typeof CAMPOS_BRAND)[number]
const ETIQUETAS_BRAND: Record<CampoBrand, string> = {
  primary: 'Primario',
  ok: 'Vigente (ok)',
  warn: 'Por vencer (warn)',
  err: 'Vencido (err)',
  info: 'Info',
}
const HEX_RE = /^#[0-9a-fA-F]{6}$/

export default function MarcaSection({ settings, esAdmin, onGuardado }: { settings: SettingsReal | null; esAdmin: boolean; onGuardado: (s: SettingsReal) => void }) {
  const { config } = useConfig()
  const [appName, setAppName] = useState('')
  const [jefeBrigada, setJefeBrigada] = useState('')
  const [logoDataUrl, setLogoDataUrl] = useState('')
  const [brand, setBrand] = useState<Record<CampoBrand, string>>({ primary: '#3b82f6', ok: '#10b981', warn: '#f59e0b', err: '#ef4444', info: '#38bdf8' })
  const [avisoLogo, setAvisoLogo] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [ok, setOk] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fuente = settings ?? config
    setAppName(fuente?.appName ?? '')
    setJefeBrigada((fuente as { jefeBrigada?: string })?.jefeBrigada ?? '')
    setLogoDataUrl((settings && 'logoDataUrl' in settings ? settings.logoDataUrl : config.logoDataUrl) ?? '')
    if (settings?.brand || config.brand) {
      const b = (settings?.brand ?? config.brand) as Partial<Record<CampoBrand, string>>
      setBrand((prev) => ({ ...prev, ...b }))
    }
  }, [settings, config])

  const lectura = !esAdmin

  function validarArchivo(f: File): string | null {
    if (!f.type.startsWith('image/')) return 'El archivo debe ser una imagen (PNG, JPG, WEBP, SVG o GIF).'
    if (f.size > MAX_LOGO_BYTES) {
      return `La imagen pesa ${(f.size / 1024).toFixed(0)} KB y el límite recomendado es 300 KB; elija un archivo más liviano.`
    }
    return null
  }

  async function onLogo(ev: React.ChangeEvent<HTMLInputElement>) {
    const f = ev.target.files?.[0]
    setAvisoLogo(null)
    if (!f) return
    const err = validarArchivo(f)
    if (err) {
      setAvisoLogo(err)
      if (fileRef.current) fileRef.current.value = ''
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result ?? '')
      if (!/^data:image\/[a-z+.-]+;base64,/.test(url)) {
        setAvisoLogo('No se pudo leer la imagen como data URL base64.')
        return
      }
      setLogoDataUrl(url)
    }
    reader.onerror = () => setAvisoLogo('Error al leer el archivo.')
    reader.readAsDataURL(f)
  }

  async function guardar(aplicarGlobal: boolean): Promise<void> {
    if (!esAdmin) return
    setGuardando(true)
    setError(null)
    setOk(null)
    try {
      const payload: Record<string, unknown> = {
        appName: appName.trim() || 'Brigada NFPA 10',
        jefeBrigada: jefeBrigada.trim(),
        logoDataUrl,
        brand: { ...brand },
      }
      const resp = await api.patch<SettingsReal>('/settings', payload)
      onGuardado(resp)
      if (aplicarGlobal) {
        // aplica sobre :root: anula los bloques [data-theme] → rige en oscuro, claro y lectura
        aplicarBrand(resp.brand as Record<string, string> | null)
        setOk('Marca aplicada y guardada en el servidor para todos los temas.')
      } else {
        setOk('Marca guardada en el servidor.')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar la marca.')
    } finally {
      setGuardando(false)
    }
  }

  const varsPrev = {
    '--primary': brand.primary,
    '--ok': brand.ok,
    '--warn': brand.warn,
    '--err': brand.err,
    '--info': brand.info,
  } as CSSProperties

  return (
    <fieldset className="rounded-xl border border-border bg-surface p-4" disabled={guardando}>
      <legend className="flex items-center gap-2 px-1 text-sm font-semibold text-text2">
        <GearIcon size={18} /> Marca de empresa
      </legend>
      {lectura && (
        <p className="mb-2 text-xs text-text2" role="note">
          Vista de solo lectura: se requiere rol admin para editar la marca.
        </p>
      )}
      {error && <Aviso tipo="err">{error}</Aviso>}
      {ok && <Aviso tipo="ok">{ok}</Aviso>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-3">
          <div>
            <label htmlFor="marca-appname" className="block text-xs font-medium text-text2">
              Nombre de la aplicación
            </label>
            <input
              id="marca-appname"
              className={inputCls}
              value={appName}
              readOnly={lectura}
              disabled={lectura}
              onChange={(e) => setAppName(e.target.value)}
              maxLength={80}
            />
          </div>
          <div>
            <label htmlFor="marca-jefe" className="block text-xs font-medium text-text2">
              Jefe de brigada (firma del informe Bomberos)
            </label>
            <input
              id="marca-jefe"
              className={inputCls}
              value={jefeBrigada}
              readOnly={lectura}
              disabled={lectura}
              onChange={(e) => setJefeBrigada(e.target.value)}
              maxLength={120}
              placeholder="Nombre y apellido del jefe de brigada"
            />
          </div>

          <div>
            <label htmlFor="marca-logo" className="block text-xs font-medium text-text2">
              Logo (PNG/JPG/SVG, máx 300 KB)
            </label>
            <input
              ref={fileRef}
              id="marca-logo"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
              disabled={lectura}
              onChange={(e) => void onLogo(e)}
              className="mt-1 block min-h-14 w-full rounded-lg border border-dashed border-border bg-bg2 px-3 pt-4 text-sm text-text2 file:mr-3 file:min-h-8 file:rounded file:border-0 file:bg-primary file:px-3 file:text-on-primary"
            />
            {logoDataUrl && (
              <div className="mt-2 flex items-center gap-3">
                <img src={logoDataUrl} alt="Logo actual" className="h-14 w-14 rounded-lg border border-border bg-bg2 object-contain p-1" />
                {!lectura && (
                  <button
                    type="button"
                    onClick={() => {
                      setLogoDataUrl('')
                      if (fileRef.current) fileRef.current.value = ''
                    }}
                    className="min-h-10 rounded-lg border border-border px-3 text-xs text-text2"
                  >
                    Quitar logo
                  </button>
                )}
              </div>
            )}
            {avisoLogo && (
              <p role="alert" className="mt-1 text-sm text-warn">
                {avisoLogo}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            {CAMPOS_BRAND.map((campo) => (
              <div key={campo} className="flex items-center gap-2 rounded-lg border border-border bg-bg2 p-2">
                <input
                  type="color"
                  id={`color-${campo}`}
                  aria-label={`Color ${ETIQUETAS_BRAND[campo]}`}
                  value={HEX_RE.test(brand[campo]) ? brand[campo] : '#000000'}
                  disabled={lectura}
                  onChange={(e) => setBrand({ ...brand, [campo]: e.target.value })}
                  className="h-12 w-12 shrink-0 cursor-pointer rounded border border-border bg-transparent"
                />
                <div className="min-w-0">
                  <label htmlFor={`color-${campo}`} className="block text-xs font-medium text-text2">
                    {ETIQUETAS_BRAND[campo]}
                  </label>
                  <input
                    aria-label={`Valor hexadecimal ${ETIQUETAS_BRAND[campo]}`}
                    value={brand[campo]}
                    readOnly={lectura}
                    disabled={lectura}
                    onChange={(e) => {
                      const v = e.target.value
                      if (HEX_RE.test(v) || v === '') setBrand({ ...brand, [campo]: v })
                    }}
                    className="w-24 bg-transparent font-mono text-xs text-text"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-text2">Vista previa (vars locales)</p>
          <div style={varsPrev} className="rounded-xl border border-border bg-bg p-4">
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-primary px-3 py-1 text-sm text-on-primary">Primario</span>
              <span className="rounded-full bg-ok px-3 py-1 text-sm text-on-primary">Vigente</span>
              <span className="rounded-full bg-warn px-3 py-1 text-sm text-bg">Por vencer</span>
              <span className="rounded-full bg-err px-3 py-1 text-sm text-on-primary">Vencido</span>
              <span className="rounded-full bg-info px-3 py-1 text-sm text-on-primary">Info</span>
            </div>
            <p className="mt-3 text-sm text-text">
              Tarjeta de muestra con <span className="font-semibold text-primary">texto primario</span>,{' '}
              <span className="font-semibold text-ok">ok</span>, <span className="font-semibold text-warn">warn</span> y{' '}
              <span className="font-semibold text-err">error</span>.
            </p>
            <p className="mt-2 text-xs text-text2">{appName || '(sin nombre)'}</p>
          </div>

          <div className="flex flex-col gap-2">
            {!lectura && (
              <>
                <button type="button" disabled={guardando} onClick={() => void guardar(false)} className={btnPrimarioCls}>
                  {guardando ? 'Guardando…' : 'Guardar marca'}
                </button>
                <button
                  type="button"
                  disabled={guardando}
                  onClick={() => void guardar(true)}
                  className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-primary px-4 text-sm font-semibold text-primary hover:bg-bg2 disabled:opacity-60"
                >
                  Aplicar a todos los temas
                </button>
              </>
            )}
            <p className="text-xs text-text2">
              «Aplicar a todos los temas» escribe las variables de marca sobre la raíz del documento: oscurece los tokens de los
              temas oscuro, claro y de lectura por igual (mismo mecanismo que /public-config).
            </p>
          </div>
        </div>
      </div>
    </fieldset>
  )
}
