import { useEffect, useState, type FormEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { ShieldFlameIcon } from '../../components/icons'
import { useAuth } from '../../context/AuthContext'
import { useConfig } from '../../context/ConfigContext'
import { DEMO_MODE } from '../../lib/api'

interface Errores {
  usuario?: string
  clave?: string
}

export default function LoginPage() {
  const { login, autenticado, cargando } = useAuth()
  const { config } = useConfig()
  const navigate = useNavigate()
  const location = useLocation()
  const desde = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? '/'

  const [usuario, setUsuario] = useState('')
  const [clave, setClave] = useState('')
  const [errores, setErrores] = useState<Errores>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (autenticado && !cargando) navigate(desde, { replace: true })
  }, [autenticado, cargando, desde, navigate])

  function validar(): Errores {
    const e: Errores = {}
    if (!usuario.trim()) e.usuario = 'El usuario es obligatorio.'
    if (!clave) e.clave = 'La clave es obligatoria.'
    else if (clave.length < 4) e.clave = 'La clave debe tener al menos 4 caracteres.'
    return e
  }

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setErrorGeneral(null)
    const errs = validar()
    setErrores(errs)
    if (Object.keys(errs).length > 0) return
    setEnviando(true)
    try {
      await login(usuario.trim(), clave)
      navigate(desde, { replace: true })
    } catch (err) {
      setErrorGeneral(err instanceof Error ? err.message : 'No se pudo iniciar sesión.')
    } finally {
      setEnviando(false)
    }
  }

  const campoError = (msg?: string, id?: string) =>
    msg ? (
      <p id={id} role="alert" className="mt-1 text-sm text-err">
        {msg}
      </p>
    ) : null

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 text-text">
      <div className="flex flex-col items-center gap-2">
        {config.logoDataUrl ? (
          <img src={config.logoDataUrl} alt="" className="h-14 w-14 rounded-lg" />
        ) : (
          <ShieldFlameIcon size={56} className="text-primary" />
        )}
        <h1 className="text-2xl font-semibold">{config.appName}</h1>
        <p className="text-text2">Inspección de extintores NFPA 10</p>
        {DEMO_MODE && (
          <p
            data-testid="banner-demo"
            className="rounded-lg border border-warn bg-warn/10 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-warn"
          >
            MODO DEMO offline — datos locales de ejemplo, cualquier contraseña válida
          </p>
        )}
      </div>

      <form onSubmit={onSubmit} noValidate className="flex w-full max-w-sm flex-col gap-4">
        <div>
          <label htmlFor="usuario" className="mb-1 block text-sm font-medium text-text2">
            Usuario
          </label>
          <input
            id="usuario"
            name="usuario"
            type="text"
            autoComplete="username"
            inputMode="text"
            className="min-h-14 w-full rounded-lg border border-border bg-surface px-3 text-base text-text placeholder:text-text2/60 focus:border-primary"
            aria-invalid={errores.usuario ? true : undefined}
            aria-describedby={errores.usuario ? 'usuario-error' : undefined}
            value={usuario}
            onChange={(e) => setUsuario(e.target.value)}
          />
          {campoError(errores.usuario, 'usuario-error')}
        </div>

        <div>
          <label htmlFor="clave" className="mb-1 block text-sm font-medium text-text2">
            Clave
          </label>
          <input
            id="clave"
            name="clave"
            type="password"
            autoComplete="current-password"
            className="min-h-14 w-full rounded-lg border border-border bg-surface px-3 text-base text-text placeholder:text-text2/60 focus:border-primary"
            aria-invalid={errores.clave ? true : undefined}
            aria-describedby={errores.clave ? 'clave-error' : undefined}
            value={clave}
            onChange={(e) => setClave(e.target.value)}
          />
          {campoError(errores.clave, 'clave-error')}
        </div>

        {errorGeneral && (
          <p role="alert" className="rounded-lg border border-err bg-err/10 px-3 py-2 text-sm text-err">
            {errorGeneral}
          </p>
        )}

        <button
          type="submit"
          disabled={enviando}
          className="min-h-14 rounded-lg bg-primary px-4 text-base font-semibold text-on-primary disabled:opacity-60"
          aria-busy={enviando}
        >
          {enviando ? 'Entrando…' : 'Iniciar sesión'}
        </button>
      </form>
    </main>
  )
}
