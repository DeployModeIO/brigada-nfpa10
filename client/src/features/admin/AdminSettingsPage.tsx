/**
 * Ajustes (ruta /admin). Rol admin: edición completa (checklist, marca, integración,
 * listas desplegables, extintores). Supervisor: modo solo lectura (el backend además
 * responde 403 a las escrituras). El rol se resuelve de AuthContext y, como el backend
 * real puede no responder (offline), el rol también se decodifica del JWT (sesion.ts).
 */
import { useCallback, useEffect, useState } from 'react'
import { TEMA_ETIQUETA, TEMAS, useTheme, type Tema } from '../../context/ThemeContext'
import { useAuth } from '../../context/AuthContext'
import { api } from '../../lib/api'
import { pendingCount } from '../../lib/offline'
import { AlertIcon, GearIcon } from '../../components/icons'
import { rolDesdeToken } from './sesion'
import { leerTipos, leerUbicaciones } from './listasConfig'
import ChecklistSection from './ChecklistSection'
import MarcaSection from './MarcaSection'
import WebhookSection from './WebhookSection'
import ListasSection from './ListasSection'
import ExtintoresSection from './ExtintoresSection'
import { Aviso } from './UI'
import type { SettingsReal } from './tipos'

export default function AdminSettingsPage() {
  const { tema, setTema } = useTheme()
  const { usuario, token } = useAuth()
  const [pendientes, setPendientes] = useState(0)
  const [settings, setSettings] = useState<SettingsReal | null>(null)
  const [errorSettings, setErrorSettings] = useState<string | null>(null)
  const [listas, setListas] = useState<{ tipos: string[]; ubicaciones: string[] }>(() => ({
    tipos: leerTipos(),
    ubicaciones: leerUbicaciones(),
  }))

  // rol: primero AuthContext (si /auth/me existiera); si no, payload del JWT (rol|user)
  const rol = usuario?.rol ?? rolDesdeToken(token) ?? undefined
  const esAdmin = rol === 'admin'
  const rolConocido = rol !== null && rol !== undefined

  useEffect(() => {
    void pendingCount().then(setPendientes).catch(() => {})
  }, [])

  useEffect(() => {
    let vivo = true
    api
      .get<SettingsReal>('/settings')
      .then((s) => {
        if (vivo) setSettings(s)
      })
      .catch((e: unknown) => {
        if (!vivo) return
        const e2 = e as { status?: number; message?: string }
        if (e2?.status === 403) setErrorSettings('Modo solo lectura: su rol no puede ver los ajustes completos.')
        else setErrorSettings(e2?.message ?? 'No se pudieron cargar los ajustes del servidor.')
      })
    return () => {
      vivo = false
    }
  }, [])

  const onGuardado = useCallback((s: SettingsReal) => setSettings(s), [])

  return (
    <section className="flex flex-col gap-4" aria-labelledby="titulo-ajustes">
      <h1 id="titulo-ajustes" className="flex items-center gap-2 text-xl font-semibold">
        <GearIcon size={22} /> Ajustes
      </h1>

      <div className="rounded-xl border border-border bg-surface p-4 text-sm">
        <p>
          Sesión: <strong>{usuario?.nombre ?? rolDesdeToken(token) ?? 'usuario'}</strong>
          {' · rol '}
          <strong className="font-mono">{rol ?? 'desconocido'}</strong>
          {' · cola pendiente: '}
          <strong>{pendientes}</strong>
        </p>
        {!rolConocido && (
          <p className="mt-1 text-xs text-warn" role="note">
            No se pudo determinar el rol de la sesión; la página queda en solo lectura y el servidor seguirá
            rechazando escrituras no autorizadas.
          </p>
        )}
        {rol === 'supervisor' && (
          <p className="mt-1 text-xs text-info" role="note">
            Rol supervisor: todas las secciones están en modo solo lectura (el servidor responde 403 a los cambios).
          </p>
        )}
      </div>

      {errorSettings && <Aviso tipo="err">{errorSettings}</Aviso>}

      <fieldset className="rounded-xl border border-border bg-surface p-4">
        <legend className="px-1 text-sm font-medium text-text2">Tema de la interfaz</legend>
        <div className="flex flex-wrap gap-2">
          {TEMAS.map((t: Tema) => (
            <button
              key={t}
              type="button"
              aria-pressed={tema === t}
              onClick={() => setTema(t)}
              className={`min-h-14 rounded-lg border px-4 text-sm font-medium ${
                tema === t ? 'border-primary bg-primary text-on-primary' : 'border-border bg-bg2 text-text'
              }`}
            >
              {TEMA_ETIQUETA[t]}
            </button>
          ))}
        </div>
      </fieldset>

      {esAdmin === false && (
        <p className="flex items-center gap-2 text-sm text-text2">
          <AlertIcon size={16} className="text-info" />
          Vista de supervisor: puede revisar la configuración, no modificarla.
        </p>
      )}

      <ChecklistSection esAdmin={esAdmin} soloLectura={!esAdmin} />
      <MarcaSection settings={settings} esAdmin={esAdmin} onGuardado={onGuardado} />
      <WebhookSection settings={settings} esAdmin={esAdmin} onGuardado={onGuardado} />
      <ListasSection
        esAdmin={esAdmin}
        settings={settings}
        onListas={(tipos, ubicaciones) => setListas({ tipos, ubicaciones })}
        onGuardado={onGuardado}
      />
      <ExtintoresSection esAdmin={esAdmin} tipos={listas.tipos} ubicaciones={listas.ubicaciones} />
    </section>
  )
}
