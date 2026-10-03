/**
 * client password-gate v1 — gate A1 (must_change_password) cerrado en la UI.
 * Cubre: interceptor api.ts (403 password_change_required → clear token + evento,
 * sin bucles y sin logout global en login/change-password), validaciones de
 * CambioPasswordPage, /cambio-password como ruta pública, y compatibilidad demo
 * (seeds demo con must_change_password falsos + demoMock responde /auth/change-password).
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'

const EVT = 'nfpa'
const DEMO_USERS = ['admin','inspector','supervisor']
const BASE_DEMO = 'http://demo.test/api/v1'

function stubGlobals() {
  const store = {}
  const eventos = []
  globalThis.localStorage = {
    getItem: (k) => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v) },
    removeItem: (k) => { delete store[k] },
  }
  globalThis.window = {
    dispatchEvent: (e) => { eventos.push(String(e.type)); return true },
    addEventListener: () => {},
    removeEventListener: () => {},
    location: { origin: 'http://test.local' },
    fetch: (input, init) => globalThis.fetch(input, init),
  }
  return { eventos, store }
}

const resp403gate = () =>
  new Response(JSON.stringify({ error: 'password_change_required', msg: 'Debes cambiar tu contraseña antes de usar otras rutas' }), {
    status: 403,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  })

test('interceptor api.ts: 403 password_change_required limpia token y dispara ' + EVT + ':password-required', async () => {
  const { eventos } = stubGlobals()
  globalThis.fetch = async () => resp403gate()
  const { api, getToken, setToken } = await import('./.build/api.mjs')
  setToken('tok-gate-1')
  await assert.rejects(() => api.get('/cualquier-ruta'), (e) => e.status === 403)
  assert.equal(getToken(), null, 'el token debe quedar limpio tras el 403 de gate')
  assert.ok(eventos.includes(EVT + ':password-required'), 'debe despachar el evento de gate')
})

test('interceptor api.ts: /auth/change-password queda excluido (evita bucles)', async () => {
  const { eventos } = stubGlobals()
  globalThis.fetch = async () => resp403gate()
  const { api, getToken, setToken } = await import('./.build/api.mjs')
  setToken('tok-gate-2')
  await assert.rejects(() => api.post('/auth/change-password', {}), (e) => e.status === 403)
  assert.equal(getToken(), 'tok-gate-2', 'el token de la página de cambio no se toca')
  assert.ok(!eventos.includes(EVT + ':password-required'), 'no re-dispara el gate desde su propia ruta')
})

test('interceptor api.ts: 401 en login/change-password NO hace logout global; rutas normales sí', async () => {
  const { eventos } = stubGlobals()
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ error: 'password_actual_incorrecta', msg: 'La contraseña actual no coincide' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    })
  const { api, getToken, setToken } = await import('./.build/api.mjs')
  setToken('tok-gate-3')
  await assert.rejects(
    () => api.post('/auth/change-password', {}),
    (e) => e.status === 401 && e.message === 'La contraseña actual no coincide',
  )
  assert.equal(getToken(), 'tok-gate-3', 'la sesión de la página de cambio sobrevive a un 401 de formulario')
  assert.ok(!eventos.includes(EVT + ':unauthorized'))
  await assert.rejects(() => api.get('/cualquier-ruta'))
  assert.equal(getToken(), null)
  assert.ok(eventos.includes(EVT + ':unauthorized'))
})

test('validaciones CambioPasswordPage: espejo de server/src/routes/auth.js', async () => {
  const { validarCambio } = await import('./.build/cambio.mjs')
  assert.ok(validarCambio({ usuario: '', actual: 'a', nueva: '12345678', confirmar: '12345678' }, false).usuario, 'sin token exige usuario')
  assert.ok(!validarCambio({ usuario: '', actual: 'a', nueva: '12345678', confirmar: '12345678' }, true).usuario, 'con token no exige usuario')
  assert.ok(validarCambio({ usuario: 'admin', actual: '', nueva: '12345678', confirmar: '12345678' }, true).actual)
  assert.ok(validarCambio({ usuario: 'admin', actual: 'a', nueva: '123', confirmar: '123' }, true).nueva, 'nueva mínimo 8')
  assert.ok(validarCambio({ usuario: 'admin', actual: 'abcdef12', nueva: 'abcdef12', confirmar: 'abcdef12' }, true).nueva, 'nueva distinta a la actual')
  assert.ok(validarCambio({ usuario: 'admin', actual: 'a', nueva: '12345678', confirmar: '87654321' }, true).confirmar, 'confirmar coincide')
  assert.deepEqual(validarCambio({ usuario: 'admin', actual: 'vieja-12', nueva: 'nueva-123', confirmar: 'nueva-123' }, false), {})
})

test('demoMock: seeds demo sin must_change_password y /auth/change-password responde (la demo nunca queda bloqueada)', async () => {
  stubGlobals()
  const { installDemoFetch } = await import('./.build/demomock.mjs')
  installDemoFetch(BASE_DEMO)
  for (const u of DEMO_USERS) {
    const res = await window.fetch(BASE_DEMO + '/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username: u, password: 'cualquiera' }),
    })
    assert.equal(res.status, 200, 'login demo ' + u)
    const j = await res.json()
    assert.ok(!j.user.must_change_password, 'demo ' + u + ' NUNCA debe exigir cambio de clave (llegó ' + j.user.must_change_password + ')')
  }
  const login = await (
    await window.fetch(BASE_DEMO + '/auth/login', { method: 'POST', body: JSON.stringify({ username: DEMO_USERS[0], password: 'x' }) })
  ).json()
  const auth = { Authorization: 'Bearer ' + login.token, 'Content-Type': 'application/json' }
  let res = await window.fetch(BASE_DEMO + '/auth/change-password', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ password_actual: 'x', password_nueva: 'nueva-clave-12' }),
  })
  assert.equal(res.status, 200, 'change-password demo responde 200')
  assert.equal((await res.json()).ok, true)
  res = await window.fetch(BASE_DEMO + '/auth/change-password', {
    method: 'POST',
    headers: auth,
    body: JSON.stringify({ password_actual: 'x', password_nueva: 'corta' }),
  })
  assert.equal(res.status, 400, 'nueva corta → 400 (espejo server)')
  res = await window.fetch(BASE_DEMO + '/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ password_actual: 'x', password_nueva: 'nueva-clave-12' }),
  })
  assert.equal(res.status, 401, 'sin token → 401 (espejo server)')
  const me = await (await window.fetch(BASE_DEMO + '/auth/me', { headers: auth })).json()
  assert.ok(!me.user.must_change_password, '/auth/me demo tampoco debe traer el flag a 1')
})

test('router data: /cambio-password es ruta pública de nivel 1 (fuera del Shell)', async () => {
  const { routes } = await import('./.build/router.mjs')
  assert.ok(routes.some((r) => r.path === '/cambio-password'), 'falta /cambio-password en routes')
  const shell = routes.find((r) => r.path === '/')
  assert.ok(shell?.children, 'falta el Shell en /')
  assert.ok(!shell.children.some((c) => (c.path ?? '') === 'cambio-password'), 'no debe vivir bajo el Shell protegido')
})

