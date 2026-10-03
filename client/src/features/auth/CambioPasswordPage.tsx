import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { ShieldFlameIcon } from '../../components/icons'
import { useAuth } from '../../context/AuthContext'
import { useConfig } from '../../context/ConfigContext'
import { api, getToken, setToken } from '../../lib/api'

/**
 * Gate A1 (must_change_password=1): cambio de contraseña obligatorio.
 * Ruta PÚBLICA dentro del layout mínimo — sin sidebar de features.
 * Contrato server (src/routes/auth.js): POST /auth/change-password exige Bearer y
 * body { password_actual, password_nueva } (8–128, distinta de la actual); al lograr
 * pone must_change_password=0 en BD y el token viejo sigue sirviendo (el middleware
 * refresca el flag desde la BD en cada request). Decisión de la client: tras el éxito
 * se limpia la sesión y se vuelve a /login con banner — re-login limpio, sin depender
 * de un JWT emitido con el flag provisional y el gate queda de un solo punto de entrada.
 * Si el token ya no está (el interceptor de api.ts lo limpió ante un 403 en curso),
 * la página muestra el campo Usuario y re-loguea con la contraseña actual para
 * obtener Bearer y recién entonces cambia la clave.
 */

export interface DatosCambio {
  usuario: string
  actual: string
  nueva: string
  confirmar: string
}

export interface ErroresCambio {
  usuario?: string
  actual?: string
  nueva?: string
  confirmar?: string
}

/** Validaciones espejo de server/src/routes/auth.js. */
export function validarCambio(d: DatosCambio, hayToken: boolean): ErroresCambio {
  const e: ErroresCambio = {}
  if (!hayToken && !d.usuario.trim()) e.usuario = 'El usuario es obligatorio.'
  if (!d.actual) e.actual = 'La contraseña actual es obligatoria.'
  if (!d.nueva) e.nueva = 'La nueva contraseña es obligatoria.'
  else if (d.nueva.length < 8 || d.nueva.length > 128) e.nueva = 'La nueva contraseña debe tener entre 8 y 128 caracteres.'
  else if (d.actual && d.nueva === d.actual) e.nueva = 'La nueva contraseña debe ser distinta a la actual.'
  if (d.confirmar !== d.nueva) e.confirmar = 'Las contraseñas no coinciden.'
  return e
}

export default function CambioPasswordPage() {
  const { logout } = useAuth()
  const { config } = useConfig()
  const navigate = useNavigate()
  const [hayToken, setHayToken] = useState(() => Boolean(getToken()))
  const [usuario, setUsuario] = useState('')
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [errores, setErrores] = useState<ErroresCambio>({})
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  async function onSubmit(ev: FormEvent) {
    ev.preventDefault()
    setErrorGeneral(null)
    const errs = validarCambio({ usuario, actual, nueva, confirmar }, hayToken)
    setErrores(errs)
    if (Object.keys(errs).length > 0) return
    setEnviando(true)
    try {
      if (!getToken()) {
        const r = await api.post<{ token: string }>('/auth/login', { username: usuario.trim(), password: actual })
        setToken(r.token)
        setHayToken(true)
      }
      await api.post('/auth/change-password', { password_actual: actual, password_nueva: nueva })
      logout()
      navigate('/login', {
        replace: true,
        state: { mensaje: 'Contraseña actualizada. Inicia sesión con tu nueva contraseña.' },
      })
    } catch (err) {
      setErrorGeneral(err instanceof Error ? err.message : 'No se pudo cambiar la contraseña.')
    } finally {
      setEnviando(false)
    }
  }

  const inputCls =
    'min-h-14 w-full rounded-lg border border-border bg-surface px-3 text-base text-text placeholder:text-text2/60 focus:border-primary'
  const labelCls = 'mb-1 block text-sm font-medium text-text2'

  const campoError = (msg?: string, id?: string) =>
    msg ? (
      <p id={id} role="alert" className="mt-1 text-sm text-err">
        {msg}
      </p>
    ) : null

  return (
    <main
      data-testid="cambio-password"
      className="flex min-h-dvh flex-col items-center justify-center gap-6 bg-bg px-6 py-10 text-text"
    >
      <div className="flex flex-col items-center gap-2 text-center">
        {config.logoDataUrl ? (
          <img src={config.logoDataUrl} alt="" className="h-14 w-14 rounded-lg" />
        ) : (
          <ShieldFlameIcon size={56} className="text-primary" />
        )}
        <h1 className="text-2xl font-semibold">Cambio de contraseña obligatorio</h1>
        <p className="max-w-sm text-text2">
          {config.appName}: tu cuenta tiene una contraseña provisional. Define una nueva para continuar.
        </p>
      </div>

      <form onSubmit={onSubmit} noValidate className="flex w-full max-w-sm flex-col gap-4">
        {!hayToken && (
          <div>
            <label htmlFor="cp-usuario" className={labelCls}>Usuario</label>
            <input
              id="cp-usuario"
              name="usuario"
              type="text"
              autoComplete="username"
              className={inputCls}
              aria-invalid={errores.usuario ? true : undefined}
              aria-describedby={errores.usuario ? 'cp-usuario-error' : undefined}
              value={usuario}
              onChange={(e) => setUsuario(e.target.value)}
            />
            {campoError(errores.usuario, 'cp-usuario-error')}
          </div>
        )}

        <div>
          <label htmlFor="cp-actual" className={labelCls}>Contraseña actual</label>
          <input
            id="cp-actual"
            name="actual"
            type="password"
            autoComplete="current-password"
            className={inputCls}
            aria-invalid={errores.actual ? true : undefined}
            aria-describedby={errores.actual ? 'cp-actual-error' : undefined}
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
          {campoError(errores.actual, 'cp-actual-error')}
        </div>

        <div>
          <label htmlFor="cp-nueva" className={labelCls}>Nueva contraseña</label>
          <input
            id="cp-nueva"
            name="nueva"
            type="password"
            autoComplete="new-password"
            className={inputCls}
            aria-invalid={errores.nueva ? true : undefined}
            aria-describedby={errores.nueva ? 'cp-nueva-error' : 'cp-nueva-hint'}
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
          />
          {!errores.nueva && (
            <p id="cp-nueva-hint" className="mt-1 text-xs text-text2">Entre 8 y 128 caracteres, distinta a la actual.</p>
          )}
          {campoError(errores.nueva, 'cp-nueva-error')}
        </div>

        <div>
          <label htmlFor="cp-confirmar" className={labelCls}>Confirmar nueva contraseña</label>
          <input
            id="cp-confirmar"
            name="confirmar"
            type="password"
            autoComplete="new-password"
            className={inputCls}
            aria-invalid={errores.confirmar ? true : undefined}
            aria-describedby={errores.confirmar ? 'cp-confirmar-error' : undefined}
            value={confirmar}
            onChange={(e) => setConfirmar(e.target.value)}
          />
          {campoError(errores.confirmar, 'cp-confirmar-error')}
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
          {enviando ? 'Guardando…' : 'Cambiar contraseña'}
        </button>
        <button
          type="button"
          onClick={() => {
            logout()
            navigate('/login', { replace: true })
          }}
          className="min-h-14 rounded-lg border border-border bg-surface px-4 text-base font-semibold text-text2"
        >
          Cerrar sesión
        </button>
      </form>

      <p className="max-w-sm text-center text-xs text-text2">Recomendado: 12 caracteres o más, combinando letras, números y símbolos.</p>
    </main>
  )
}
