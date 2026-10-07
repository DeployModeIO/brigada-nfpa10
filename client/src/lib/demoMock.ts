/**
 * MODO DEMO — Mock local del contrato API (server/docs/API.md) sin servidor ni internet.
 * Se instala parcheando window.fetch (ver api.ts): toda URL que empiece por API_BASE se
 * resuelve aquí con latencia simulada de 150 ms y una "BD" en localStorage (clave
 * `nfpa_brigada_demo_db`, versionada → se re-seedea si cambia la versión).
 * Reglas de estado idénticas a server/src/lib/estado.js: +30 d en inspección,
 * falla de ítem crítico (presion_rango/precinto_intacto/manguera_sin_fisuras) ⇒ rechazado.
 * Login demo: usuarios admin/inspector/supervisor — ACEPTA CUALQUIER contraseña.
 */

const DB_KEY = 'nfpa_brigada_demo_db'
const DB_VERSION = 2
const LATENCIA_MS = 150

const CRITICAS = ['presion_rango', 'manometro_rango', 'precinto_intacto', 'manguera_sin_fisuras']
const TAG_RE = /^[a-zA-Z0-9_-]{2,32}$/
const COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/

// ---------- tipos de la BD ----------

interface ExtRow {
  tag: string
  ubicacion: string
  tipo: string
  agente?: string
  ultima_recarga?: string | null
  venc_recarga?: string | null
  ultima_hidro?: string | null
  venc_hidro?: string | null
  metadata?: string | null
  capacidad_l: number | null
  presion_bar: number | null
  fecha_fabricacion: string | null
  ultima_inspeccion: string | null
  proximo_vencimiento: string | null
  estado_inspeccion: string
  rechazado: number
  notas: string | null
  lat: number | null
  lng: number | null
  activo: number
  created_at: string
  updated_at: string
}

interface ChecklistRow {
  id: number
  clave: string
  etiqueta: string
  orden: number
  activo: number
}

interface InspRow {
  id: number
  tag: string
  resultados: Record<string, boolean>
  fallas: string[]
  criticas_fallan: number
  observaciones: string | null
  foto: string | null
  lat: number | null
  lng: number | null
  dispositivo: string | null
  inspector_id: number | null
  inspector_username: string
  created_at: string
}

interface Brand {
  primary: string
  ok: string
  warn: string
  err: string
  info: string
}

interface Settings {
  appName: string
  logoDataUrl: string
  temaDefault: 'dark' | 'light'
  webhookUrl: string
  webhookApi: string
  brand: Brand
  configTipos: string[]
  configUbicaciones: string[]
}

interface DemoDb {
  version: number
  nextChecklistId: number
  nextInspectionId: number
  extintores: ExtRow[]
  checklist: ChecklistRow[]
  inspecciones: InspRow[]
  settings: Settings
}

interface JwtPayload {
  id: number
  username: string
  nombre: string
  rol: string
  exp: number
  must_change_password?: number
}

// ---------- usuarios demo (cualquier contraseña válida) ----------

const USERS: JwtPayload[] = [
  { id: 1, username: 'admin', nombre: 'Admin Brigada', rol: 'admin', exp: 0, must_change_password: 0 },
  { id: 2, username: 'inspector', nombre: 'Inspectora de Campo', rol: 'inspector', exp: 0, must_change_password: 0 },
  { id: 3, username: 'supervisor', nombre: 'Supervisor de Seguridad', rol: 'supervisor', exp: 0, must_change_password: 0 },
]

// ---------- helpers de tiempo/base64 ----------

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

function iso(ms: number): string {
  return new Date(ms).toISOString()
}

const DIA = 86_400_000

function b64urlEncode(s: string): string {
  return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_')
}

function b64urlDecode(s: string): string {
  const b = s.replace(/-/g, '+').replace(/_/g, '/')
  return decodeURIComponent(escape(atob(b)))
}

function crearToken(p: JwtPayload): string {
  const header = b64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = b64urlEncode(JSON.stringify(p))
  return `${header}.${payload}.demo-firma-no-verificada`
}

function parsearToken(authz: string | undefined): JwtPayload | null {
  if (!authz) return null
  const m = /^Bearer\s+(.+)$/i.exec(authz.trim())
  if (!m) return null
  const parts = m[1].split('.')
  if (parts.length !== 3) return null
  try {
    const p = JSON.parse(b64urlDecode(parts[1])) as Partial<JwtPayload>
    if (typeof p.username !== 'string') return null
    if (typeof p.exp === 'number' && p.exp * 1000 < Date.now()) return null
    return { id: p.id ?? 0, username: p.username, nombre: p.nombre ?? p.username, rol: p.rol ?? '', exp: p.exp ?? 0 }
  } catch {
    return null
  }
}

// ---------- estadoCalculado (espejo de server/src/lib/estado.js) ----------

function parseTs(v: unknown): number {
  if (!v) return NaN
  const s = String(v).trim().replace(' ', 'T')
  return Date.parse(s)
}

const DIA_MES = 30.44 * DIA
const DIA_ANIO = 365.25 * DIA
const HIDRO_ANIOS: Record<string, number> = { PQS: 12, CO2: 5, AGUA: 5, BC: 5, K: 5 }

// Motor NFPA espejo de server/src/lib/nfpa.js (reglas por defecto de la línea).
function estadoCalculado(e: ExtRow, now = Date.now()): string {
  if (Number(e.rechazado) === 1) return 'rechazado'
  if (!e.ultima_inspeccion || !e.proximo_vencimiento) return 'sin_inspeccionar'
  const t = parseTs(e.proximo_vencimiento)
  if (Number.isNaN(t)) return 'sin_inspeccionar'
  let vencido = false
  let porVencer = false
  const evalV = (epoch: number, ventanaDias: number) => {
    if (epoch < now) vencido = true
    else if (epoch - now <= ventanaDias * DIA) porVencer = true
  }
  evalV(t, 7)
  const vr = parseTs(e.venc_recarga)
  const ur = parseTs(e.ultima_recarga)
  if (!Number.isNaN(vr)) evalV(vr, 30)
  else if (!Number.isNaN(ur)) evalV(ur + 12 * DIA_MES, 30)
  const vh = parseTs(e.venc_hidro)
  const fb = parseTs(e.fecha_fabricacion)
  const hid = e.agente ? HIDRO_ANIOS[String(e.agente).toUpperCase()] : undefined
  if (!Number.isNaN(vh)) evalV(vh, 30)
  else if (hid && !Number.isNaN(fb)) evalV(fb + hid * DIA_ANIO, 30)
  if (vencido) return 'vencido'
  if (porVencer) return 'por_vencer'
  return 'vigente'
}

function withEstado(row: ExtRow, now = Date.now()): Record<string, unknown> {
  return { ...row, rechazado: Number(row.rechazado) === 1, estadoCalculado: estadoCalculado(row, now) }
}

// ---------- seed determinista ----------

function mkExt(
  tag: string,
  ubicacion: string,
  tipo: string,
  agente = '',
  cap: number,
  pres: number,
  fabMs: number,
  ultimaMs: number | null,
  proxMs: number | null,
  opts: { rechazado?: boolean; notas?: string; lat?: number; lng?: number; estadoInsp?: string } = {},
): ExtRow {
  const created = iso(fabMs)
  return {
    tag,
    ubicacion,
    tipo,
    agente,
    capacidad_l: cap,
    presion_bar: pres,
    fecha_fabricacion: created,
    ultima_inspeccion: ultimaMs === null ? null : iso(ultimaMs),
    proximo_vencimiento: proxMs === null ? null : iso(proxMs),
    estado_inspeccion: opts.estadoInsp ?? (ultimaMs === null ? 'n_a' : opts.rechazado ? 'falla' : 'pasa'),
    rechazado: opts.rechazado ? 1 : 0,
    notas: opts.notas ?? null,
    lat: opts.lat ?? null,
    lng: opts.lng ?? null,
    activo: 1,
    created_at: created,
    updated_at: ultimaMs === null ? created : iso(ultimaMs),
  }
}

function seedExtintores(now: number): ExtRow[] {
  const d = (n: number) => now + n * DIA
  const tipos: Record<string, [string, number, number]> = {
    PQS: ['PQS ABC', 6, 120],
    CO2: ['CO2', 4.5, 57],
    AGUA: ['AGUA a presión', 9, 60],
    BC: ['BC', 10, 120],
    K: ['Clase K (cocina)', 6, 90],
  }
  const filas: Array<[string, string, keyof typeof tipos, 'vigente' | 'por_vencer' | 'vencido' | 'rechazado' | 'sin_inspeccionar']> = [
    ['EXTF-COC-001', 'Cocina industrial', 'K', 'vigente'],
    ['EXTF-COC-002', 'Cocina industrial — salida', 'K', 'por_vencer'],
    ['EXTF-COC-003', 'Cocina — comedor', 'PQS', 'vigente'],
    ['EXTF-COC-004', 'Cocina — despensa', 'CO2', 'vigente'],
    ['EXTF-COC-005', 'Cocina — freidora', 'K', 'rechazado'],
    ['EXTF-ALM-001', 'Almacén A — pasillo 1', 'PQS', 'vigente'],
    ['EXTF-ALM-002', 'Almacén A — pasillo 2', 'PQS', 'vencido'],
    ['EXTF-ALM-003', 'Almacén B — rampa', 'AGUA', 'vigente'],
    ['EXTF-ALM-004', 'Almacén B — químicos', 'BC', 'vigente'],
    ['EXTF-ALM-005', 'Almacén C — mezanine', 'PQS', 'por_vencer'],
    ['EXTF-ALM-006', 'Almacén C — nueva área', 'PQS', 'sin_inspeccionar'],
    ['EXTF-OFI-001', 'Oficinas piso 1 — recepción', 'CO2', 'sin_inspeccionar'],
    ['EXTF-OFI-002', 'Oficinas piso 1 — pasillo', 'PQS', 'por_vencer'],
    ['EXTF-OFI-003', 'Oficinas piso 2 — sala J', 'CO2', 'vigente'],
    ['EXTF-OFI-004', 'Oficinas piso 2 — gerencia', 'PQS', 'vigente'],
    ['EXTF-OFI-005', 'Oficinas piso 3 — archivo', 'AGUA', 'vencido'],
    ['EXTF-OFI-006', 'Oficinas piso 3 — servidores', 'CO2', 'vigente'],
    ['EXTF-OFI-007', 'Oficinas piso 4 — café', 'PQS', 'rechazado'],
    ['EXTF-LAB-001', 'Laboratorio 1 — acceso', 'BC', 'sin_inspeccionar'],
    ['EXTF-LAB-002', 'Laboratorio 1 — campanas', 'CO2', 'vigente'],
    ['EXTF-LAB-003', 'Laboratorio 2 — solventes', 'BC', 'vencido'],
    ['EXTF-LAB-004', 'Laboratorio 2 — balanza', 'PQS', 'vigente'],
    ['EXTF-LAB-005', 'Laboratorio 3 — nevera', 'CO2', 'por_vencer'],
    ['EXTF-TOL-001', 'Taller mecánico — banco', 'PQS', 'rechazado'],
    ['EXTF-TOL-002', 'Taller — pintura', 'BC', 'vigente'],
    ['EXTF-TOL-003', 'Taller — compresor', 'CO2', 'vigente'],
    ['EXTF-TOL-004', 'Taller — soldadura', 'PQS', 'vencido'],
    ['EXTF-TOL-005', 'Taller — salida emergencia', 'AGUA', 'vigente'],
    ['EXTF-REC-001', 'Recibimiento — tornería', 'PQS', 'vigente'],
    ['EXTF-REC-002', 'Recibimiento — andén', 'AGUA', 'vigente'],
    ['EXTF-REC-003', 'Recibimiento — oficinas', 'CO2', 'por_vencer'],
    ['EXTF-REC-004', 'Recibimiento — visitors', 'PQS', 'vigente'],
    ['EXTF-PLT-001', 'Planta eléctrica — turbo', 'CO2', 'vigente'],
    ['EXTF-PLT-002', 'Planta eléctrica — tablero', 'BC', 'por_vencer'],
    ['EXTF-PLT-003', 'Planta eléctrica — diésel', 'PQS', 'sin_inspeccionar'],
    ['EXTF-VEH-001', 'Vehículo — patrulla 1', 'PQS', 'vigente'],
    ['EXTF-VEH-002', 'Vehículo — patrulla 2', 'PQS', 'vencido'],
    ['EXTF-VEH-003', 'Vehículo — forklift 1', 'BC', 'sin_inspeccionar'],
    ['EXTF-VEH-004', 'Vehículo — forklift 2', 'BC', 'vigente'],
    ['EXTF-VEH-005', 'Vehículo — camión 3', 'PQS', 'rechazado'],
  ]
  return filas.map(([tag, ubicacion, tk, estado], i) => {
    const [tipo, cap, pres] = tipos[tk]
    const fab = d(-(400 + i * 30))
    const of = (i % 5) + 1
    switch (estado) {
      case 'vigente':
        return mkExt(tag, ubicacion, tipo, tk, cap, pres, fab, d(-(10 + (i % 12))), d(15 + (i % 10) * 2), { lat: 12.1 + i * 0.001, lng: -70.05 + i * 0.001 })
      case 'por_vencer':
        return mkExt(tag, ubicacion, tipo, tk, cap, pres, fab, d(-27), d(of), {})
      case 'vencido':
        return mkExt(tag, ubicacion, tipo, tk, cap, pres, fab, d(-(35 + of * 4)), d(-(3 + of * 6)), { notas: 'Pendiente de recarga' })
      case 'rechazado':
        return mkExt(tag, ubicacion, tipo, tk, cap, pres, fab, d(-(5 + of)), d(25), { rechazado: true, notas: 'Fuera de servicio: falla crítica confirmada' })
      default:
        return mkExt(tag, ubicacion, tipo, tk, cap, pres, fab, null, null, { notas: 'De alta reciente, sin primera inspección' })
    }
  })
}

function seedChecklist(): ChecklistRow[] {
  const items: Array<[string, string]> = [
    ['presion_rango', 'Manómetro en rango verde'],
    ['manometro_rango', 'Manómetro en rango verde (NFPA §7.2)'],
    ['precinto_intacto', 'Precinto y seguro intactos'],
    ['manguera_sin_fisuras', 'Manguera/pitorro sin fisuras'],
    ['senaletica_visible', 'Señalética visible'],
    ['acceso_despejado', 'Acceso despejado'],
    ['soporte_firme', 'Soporte firme y sin corrosión'],
  ]
  return items.map(([clave, etiqueta], i) => ({ id: i + 1, clave, etiqueta, orden: i + 1, activo: 1 }))
}

function seedInspecciones(now: number, ext: ExtRow[]): InspRow[] {
  const claves = seedChecklist().map((c) => c.clave)
  let id = 1
  const mk = (
    tag: string,
    daysAgo: number,
    usuario: JwtPayload,
    fallas: string[] = [],
    obs?: string,
  ): InspRow => {
    const resultados: Record<string, boolean> = {}
    for (const c of claves) resultados[c] = !fallas.includes(c)
    const criticas = fallas.filter((f) => CRITICAS.includes(f))
    const created = iso(now - daysAgo * DIA)
    const e = ext.find((x) => x.tag === tag)
    return {
      id: id++,
      tag,
      resultados,
      fallas,
      criticas_fallan: criticas.length > 0 ? 1 : 0,
      observaciones: obs ?? null,
      foto: null,
      lat: e?.lat ?? null,
      lng: e?.lng ?? null,
      dispositivo: 'demo-seed',
      inspector_id: usuario.id,
      inspector_username: usuario.username,
      created_at: created,
    }
  }
  const [uAdm, uIns, uSup] = USERS
  return [
    mk('EXTF-COC-001', 8, uIns),
    mk('EXTF-COC-005', 6, uSup, ['presion_rango', 'manguera_sin_fisuras'], 'Manómetro en cero; manguera cuarteada'),
    mk('EXTF-ALM-002', 40, uIns, ['acceso_despejado'], 'Pallets bloqueando el acceso'),
    mk('EXTF-OFI-003', 12, uIns),
    mk('EXTF-OFI-007', 4, uSup, ['precinto_intacto'], 'Precinto roto, seguro ausente'),
    mk('EXTF-LAB-002', 15, uAdm),
    mk('EXTF-TOL-001', 3, uSup, ['presion_rango'], 'Presión fuera de rango: derivar a recargador'),
    mk('EXTF-TOL-003', 20, uIns),
    mk('EXTF-VEH-005', 2, uSup, ['manguera_sin_fisuras', 'soporte_firme'], 'Pitorro fisurado y soporte oxidado'),
    mk('EXTF-REC-001', 25, uIns),
    mk('EXTF-PLT-001', 18, uIns),
    mk('EXTF-COC-002', 27, uIns),
  ]
}

function defaultSettings(): Settings {
  return {
    appName: 'Brigada Demo',
    logoDataUrl: '',
    temaDefault: 'light',
    webhookUrl: '',
    webhookApi: '',
    brand: { primary: '#0f5f8f', ok: '#1a6f36', warn: '#92400e', err: '#b91c1c', info: '#0f5f8f' },
    configTipos: ['PQS ABC', 'CO2', 'AFFF (espuma)', 'AGUA a presión', 'BC', 'Clase K (cocina)'],
    configUbicaciones: ['Planta Compresora', 'Módulo POB (Personal Offshore)', 'Área de Tanques de Almacenamiento', 'Muelle de Carguío', 'Taller de Mantenimiento', 'Subestación Eléctrica', 'Almacén Químico', 'Oficinas', 'Planta eléctrica'],
  }
}

function seedDb(): DemoDb {
  const now = Date.now()
  const extintores = seedExtintores(now)
  const checklist = seedChecklist()
  const inspecciones = seedInspecciones(now, extintores)
  return {
    version: DB_VERSION,
    nextChecklistId: checklist.length + 1,
    nextInspectionId: inspecciones.length + 1,
    extintores,
    checklist,
    inspecciones,
    settings: defaultSettings(),
  }
}

// ---------- "BD" en localStorage (con respaldo en memoria) ----------

let db: DemoDb | null = null
let memoria = ''

function lsRead(): string | null {
  try {
    return localStorage.getItem(DB_KEY)
  } catch {
    return memoria || null
  }
}

function lsWrite(v: string): void {
  memoria = v
  try {
    localStorage.setItem(DB_KEY, v)
  } catch {
    /* modo privado / cuota: seguimos en memoria durante la sesión */
  }
}

function cargarDb(): DemoDb {
  if (db) return db
  const raw = lsRead()
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as DemoDb
      if (parsed && parsed.version === DB_VERSION) {
        db = parsed
        return db
      }
    } catch {
      /* corrupto: re-seedea */
    }
  }
  db = seedDb()
  guardar()
  return db
}

function guardar(): void {
  if (db) lsWrite(JSON.stringify(db))
}

// ---------- respuestas ----------

const MIME_JSON = { 'Content-Type': 'application/json; charset=utf-8' }

function json(status: number, data: unknown): Response {
  return new Response(JSON.stringify(data), { status, headers: MIME_JSON })
}

const err = (status: number, error: string, msg: string): Response => json(status, { error, msg })

function leerHeader(init: RequestInit | undefined, nombre: string): string | undefined {
  const h = init?.headers
  if (!h) return undefined
  if (h instanceof Headers) return h.get(nombre) ?? undefined
  if (Array.isArray(h)) {
    for (const [k, v] of h) if (k.toLowerCase() === nombre.toLowerCase()) return v
    return undefined
  }
  for (const [k, v] of Object.entries(h as Record<string, string>)) {
    if (k.toLowerCase() === nombre.toLowerCase()) return v
  }
  return undefined
}

function leerBody(init: RequestInit | undefined): Record<string, unknown> {
  const b = init?.body
  if (b === undefined || b === null) return {}
  if (typeof b === 'string') {
    try {
      return JSON.parse(b) as Record<string, unknown>
    } catch {
      return {}
    }
  }
  return {}
}

function paginate(q: URLSearchParams): { page: number; size: number; offset: number } {
  const page = Math.max(1, parseInt(q.get('page') ?? '', 10) || 1)
  const size = Math.min(200, Math.max(1, parseInt(q.get('size') ?? '', 10) || 20))
  return { page, size, offset: (page - 1) * size }
}

function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? '' : String(v)
  return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
}

// ---------- panel (espejo de server/src/routes/alerts.js) ----------

function panelData(): Record<string, unknown> {
  const d = cargarDb()
  const now = Date.now()
  const panel: Record<'verde' | 'amarillo' | 'rojo' | 'negro', Array<Record<string, unknown>>> = {
    verde: [],
    amarillo: [],
    rojo: [],
    negro: [],
  }
  const mapa: Record<string, keyof typeof panel> = {
    vigente: 'verde',
    por_vencer: 'amarillo',
    vencido: 'rojo',
    rechazado: 'negro',
  }
  for (const r of d.extintores.filter((x) => x.activo === 1)) {
    const est = estadoCalculado(r, now)
    const item = {
      tag: r.tag,
      ubicacion: r.ubicacion,
      tipo: r.tipo,
      capacidad_l: r.capacidad_l,
      proximo_vencimiento: r.proximo_vencimiento,
      estado_inspeccion: r.estado_inspeccion,
      rechazado: Number(r.rechazado) === 1,
      estadoCalculado: est,
    }
    const clave = mapa[est]
    if (clave) panel[clave].push(item)
  }
  const byVenc = (a: Record<string, unknown>, b: Record<string, unknown>): number =>
    String(a.proximo_vencimiento ?? '9999').localeCompare(String(b.proximo_vencimiento ?? '9999'))
  panel.amarillo.sort(byVenc)
  panel.rojo.sort(byVenc)
  return { ...panel, cont: { v: panel.verde.length, g: panel.amarillo.length, r: panel.rojo.length, n: panel.negro.length } }
}

// ---------- XLSX (librería `xlsx` ya instalada, 100 % cliente) ----------

async function xlsxResponse(): Promise<Response> {
  const mod = (await import('xlsx')) as unknown as { default?: typeof import('xlsx') } & typeof import('xlsx')
  const XLSX = mod.default ?? mod
  const d = cargarDb()
  const now = Date.now()
  const rows = d.extintores
    .filter((x) => x.activo === 1)
    .map((x) => ({
      tag: x.tag,
      ubicacion: x.ubicacion,
      tipo: x.tipo,
      'capacidad_l': x.capacidad_l,
      'presion_bar': x.presion_bar,
      'fecha_fabricacion': x.fecha_fabricacion,
      'ultima_inspeccion': x.ultima_inspeccion,
      'proximo_vencimiento': x.proximo_vencimiento,
      'estado_inspeccion': x.estado_inspeccion,
      rechazado: Number(x.rechazado) === 1 ? 'SÍ' : 'NO',
      estadoCalculado: estadoCalculado(x, now),
      notas: x.notas ?? '',
      lat: x.lat,
      lng: x.lng,
    }))
  const ws = XLSX.utils.json_to_sheet(rows)
  ws['!cols'] = Object.keys(rows[0] ?? { tag: 1 }).map((k) => ({ wch: Math.max(12, k.length + 2) }))
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Extintores')
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return new Response(out, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="brigada-nfpa10-extintores.xlsx"`,
    },
  })
}

// ---------- validación de altas/updates de extintor (espejo de parseRec) ----------

function parseExt(body: Record<string, unknown>, full: boolean): { rec: Partial<ExtRow>; error: string | null } {
  const rec: Partial<ExtRow> = {}
  const errs: string[] = []
  if (body.tag !== undefined) {
    const t = String(body.tag).trim().slice(0, 32)
    if (!t || !TAG_RE.test(t)) errs.push('tag: alfanumérico (a-z0-9_-), 2-32 chars')
    else rec.tag = t.toUpperCase()
  } else if (full) errs.push('tag es requerido')
  if (body.ubicacion !== undefined) {
    const v = String(body.ubicacion).trim().slice(0, 255)
    if (!v) errs.push('ubicacion inválida')
    else rec.ubicacion = v
  } else if (full) errs.push('ubicacion es requerido')
  if (body.tipo !== undefined) rec.tipo = String(body.tipo).trim().slice(0, 64)
  if (body.notas !== undefined) rec.notas = body.notas === null ? null : String(body.notas).slice(0, 4000)
  for (const f of ['capacidad_l', 'presion_bar', 'lat', 'lng'] as const) {
    if (body[f] !== undefined) {
      if (body[f] === null) {
        ;(rec as Record<string, unknown>)[f] = null
        continue
      }
      const n = Number(body[f])
      if (!Number.isFinite(n) || n < 0 || n > 100000) errs.push(`${f}: número inválido`)
      else (rec as Record<string, unknown>)[f] = n
    }
  }
  for (const f of ['fecha_fabricacion', 'ultima_inspeccion', 'proximo_vencimiento'] as const) {
    if (body[f] !== undefined) {
      if (body[f] === null || body[f] === '') {
        ;(rec as Record<string, unknown>)[f] = null
        continue
      }
      if (Number.isNaN(parseTs(body[f]))) errs.push(`${f}: fecha inválida (ISO 8601)`)
      else (rec as Record<string, unknown>)[f] = iso(parseTs(body[f]))
    }
  }
  if (body.estado_inspeccion !== undefined) {
    const v = String(body.estado_inspeccion)
    if (!['pasa', 'falla', 'n_a'].includes(v)) errs.push('estado_inspeccion: pasa|falla|n_a')
    else rec.estado_inspeccion = v
  }
  if (body.rechazado !== undefined) rec.rechazado = body.rechazado === true || body.rechazado === 1 || body.rechazado === '1' ? 1 : 0
  return { rec, error: errs.length ? errs.join('; ') : null }
}

// ---------- enrutador ----------

/** `path` es la URL relativa a API_BASE, p. ej. `/extinguishers?size=200`. */
async function handleDemo(path: string, init: RequestInit | undefined): Promise<Response> {
  const d = cargarDb()
  const i = path.indexOf('?')
  const rest = i === -1 ? path : path.slice(0, i)
  const q = new URLSearchParams(i === -1 ? '' : path.slice(i + 1))
  const method = (init?.method ?? 'GET').toUpperCase()
  const body = leerBody(init)
  const user = parsearToken(leerHeader(init, 'Authorization'))
  const seg = (p: string) => decodeURIComponent(p.replace(/^\//, ''))
  const solo = (rol: string): Response | null => {
    if (!user) return err(401, 'unauthorized', 'Token requerido')
    if (user.rol !== rol) return err(403, 'forbidden', `Se requiere rol ${rol}`)
    return null
  }
  const autenticado = (): Response | null => (user ? null : err(401, 'unauthorized', 'Token requerido'))

  // --- auth ---
  if (method === 'POST' && rest === '/auth/login') {
    const u = USERS.find((x) => x.username === String(body.username ?? '').trim().toLowerCase())
    if (!u) return err(401, 'invalid_credentials', 'Credenciales incorrectas')
    const payload = { ...u, exp: Math.floor(Date.now() / 1000) + 10 * 365 * 86400 }
    return json(200, { token: crearToken(payload), user: { id: u.id, username: u.username, nombre: u.nombre, rol: u.rol, must_change_password: Number(u.must_change_password) === 1 } })
  }
  if (method === 'GET' && rest === '/auth/me') {
    const e = autenticado()
    if (e) return e
    const su = USERS.find((x) => x.username === user!.username)
    return json(200, { user: { id: user!.id, username: user!.username, nombre: user!.nombre, rol: user!.rol, must_change_password: Number(su?.must_change_password) === 1 } })
  }
  // Espejo del gate A1 del server: los seeds demo traen must_change_password=0, así que la
  // demo jamás responde 403 password_change_required (el flujo de demo no se bloquea).
  if (method === 'POST' && rest === '/auth/change-password') {
    const e = autenticado()
    if (e) return e
    const actual = typeof body.password_actual === 'string' ? body.password_actual : ''
    const nueva = typeof body.password_nueva === 'string' ? body.password_nueva : ''
    if (!actual) return err(400, 'bad_request', 'password_actual requerida')
    if (nueva.length < 8 || nueva.length > 128) return err(400, 'bad_request', 'password_nueva: mínimo 8 caracteres')
    if (actual === nueva) return err(400, 'bad_request', 'La clave nueva debe ser distinta a la actual')
    const su2 = USERS.find((x) => x.username === user!.username)
    if (su2) su2.must_change_password = 0
    return json(200, { ok: true, msg: 'Contraseña actualizada' })
  }

  // --- pública ---
  if (method === 'GET' && rest === '/public-config') {
    const s = d.settings
    return json(200, {
      appName: s.appName,
      logoDataUrl: s.logoDataUrl,
      brand: s.brand,
      temaDefault: s.temaDefault,
      configTipos: s.configTipos,
      configUbicaciones: s.configUbicaciones,
    })
  }

  const e1 = autenticado()
  if (e1) return e1

  // --- extintores ---
  if (rest === '/extinguishers' && method === 'GET') {
    const { page, size, offset } = paginate(q)
    const now = Date.now()
    const needle = (q.get('q') ?? '').replace(/[%_]/g, '').trim().toLowerCase()
    const estado = q.get('estado') ?? ''
    let items = d.extintores.filter((x) => x.activo === 1).map((x) => withEstado(x, now))
    if (estado) items = items.filter((r) => r.estadoCalculado === estado)
    if (needle)
      items = items.filter(
        (r) =>
          String(r.tag).toLowerCase().includes(needle) ||
          String(r.ubicacion ?? '').toLowerCase().includes(needle) ||
          String(r.tipo ?? '').toLowerCase().includes(needle),
      )
    items.sort((a, b) => (String(a.tag) < String(b.tag) ? -1 : 1))
    return json(200, { items: items.slice(offset, offset + size), total: items.length, page, size })
  }
  if (rest === '/extinguishers' && method === 'POST') {
    const e = solo('admin')
    if (e) return e
    const { rec, error } = parseExt(body, true)
    if (error) return err(400, 'bad_request', error)
    if (d.extintores.some((x) => x.tag === rec.tag)) return err(409, 'conflict', `tag "${rec.tag}" ya existe`)
    const nowIso = iso(Date.now())
    const row: ExtRow = {
      tag: rec.tag!,
      ubicacion: rec.ubicacion!,
      tipo: rec.tipo ?? '',
      capacidad_l: rec.capacidad_l ?? null,
      presion_bar: rec.presion_bar ?? null,
      fecha_fabricacion: rec.fecha_fabricacion ?? null,
      ultima_inspeccion: rec.ultima_inspeccion ?? null,
      proximo_vencimiento: rec.proximo_vencimiento ?? null,
      estado_inspeccion: rec.estado_inspeccion ?? 'n_a',
      rechazado: rec.rechazado ?? 0,
      notas: rec.notas ?? null,
      lat: rec.lat ?? null,
      lng: rec.lng ?? null,
      activo: 1,
      created_at: nowIso,
      updated_at: nowIso,
    }
    d.extintores.push(row)
    guardar()
    return json(201, withEstado(row))
  }
  if (rest.startsWith('/extinguishers/')) {
    const tag = seg(rest.slice('/extinguishers/'.length)).toUpperCase()
    const row = d.extintores.find((x) => x.tag === tag && x.activo === 1)
    if (!row) return err(404, 'not_found', 'Extintor no encontrado')
    if (method === 'GET') return json(200, withEstado(row))
    if (method === 'PATCH') {
      const { rec, error } = parseExt(body, false)
      if (error) return err(400, 'bad_request', error)
      delete rec.tag
      const keys = Object.keys(rec) as Array<keyof ExtRow>
      if (!keys.length) return err(400, 'bad_request', 'Nada que actualizar')
      for (const k of keys) (row as unknown as Record<string, unknown>)[k] = rec[k]
      row.updated_at = iso(Date.now())
      guardar()
      return json(200, withEstado(row))
    }
    if (method === 'DELETE') {
      const e = solo('admin')
      if (e) return e
      row.activo = 0
      row.updated_at = iso(Date.now())
      guardar()
      return json(200, { ok: true, tag, activo: false })
    }
  }

  // --- checklist ---
  if (rest === '/checklist-items' && method === 'GET') {
    return json(200, d.checklist.filter((c) => c.activo === 1).sort((a, b) => a.orden - b.orden))
  }
  if (rest === '/checklist-items' && method === 'POST') {
    const e = solo('admin')
    if (e) return e
    const clave = String(body.clave ?? '').trim()
    const etiqueta = String(body.etiqueta ?? '').trim()
    if (!clave || !etiqueta) return err(400, 'bad_request', 'clave y etiqueta son requeridas')
    if (d.checklist.some((c) => c.clave === clave)) return err(409, 'conflict', `clave "${clave}" ya existe`)
    const row: ChecklistRow = {
      id: d.nextChecklistId++,
      clave,
      etiqueta,
      orden: Number(body.orden ?? d.checklist.length + 1) || d.checklist.length + 1,
      activo: body.activo === undefined || body.activo === true || body.activo === 1 ? 1 : 0,
    }
    d.checklist.push(row)
    guardar()
    return json(201, row)
  }
  if (rest.startsWith('/checklist-items/')) {
    const id = Number(rest.slice('/checklist-items/'.length))
    const idx = d.checklist.findIndex((c) => c.id === id)
    if (idx === -1) return err(404, 'not_found', 'Ítem no encontrado')
    if (method === 'PATCH') {
      const e = solo('admin')
      if (e) return e
      const cur = d.checklist[idx]
      if (body.clave !== undefined) {
        const c = String(body.clave).trim()
        if (!c) return err(400, 'bad_request', 'clave inválida')
        if (d.checklist.some((x) => x.clave === c && x.id !== id)) return err(409, 'conflict', `clave "${c}" ya existe`)
        cur.clave = c
      }
      if (body.etiqueta !== undefined) cur.etiqueta = String(body.etiqueta).trim() || cur.etiqueta
      if (body.orden !== undefined) cur.orden = Number(body.orden) || cur.orden
      if (body.activo !== undefined) cur.activo = body.activo === true || body.activo === 1 ? 1 : 0
      guardar()
      return json(200, { ...cur })
    }
    if (method === 'DELETE') {
      const e = solo('admin')
      if (e) return e
      d.checklist.splice(idx, 1)
      guardar()
      return json(200, { ok: true, id })
    }
  }

  // --- inspecciones ---
  if (rest === '/inspections' && method === 'POST') {
    const tag = String(body.tag ?? '').trim().toUpperCase()
    if (!tag) return err(400, 'bad_request', 'tag es requerido')
    const ext = d.extintores.find((x) => x.tag === tag && x.activo === 1)
    if (!ext) return err(404, 'not_found', 'Extintor no encontrado')
    const res = body.resultados
    if (!res || typeof res !== 'object' || Array.isArray(res)) return err(400, 'bad_request', 'resultados debe ser un objeto {clave: bool}')
    const activos = d.checklist.filter((c) => c.activo === 1).sort((a, b) => a.orden - b.orden)
    const claves = activos.map((c) => c.clave)
    const setClaves = new Set(claves)
    const desconocidas = Object.keys(res as Record<string, unknown>).filter((k) => !setClaves.has(k))
    if (desconocidas.length) return err(400, 'bad_request', `Claves de checklist desconocidas: ${desconocidas.join(', ')}`)
    const resultados: Record<string, boolean> = {}
    for (const c of claves) {
      const v = (res as Record<string, unknown>)[c]
      resultados[c] = v === undefined ? false : Boolean(v)
    }
    const fallas = claves.filter((c) => !resultados[c])
    const criticas = fallas.filter((f) => CRITICAS.includes(f))
    const rechazado = criticas.length > 0 ? 1 : 0
    const estado_inspeccion = fallas.length ? 'falla' : 'pasa'
    const now = new Date()
    const nowIso = now.toISOString()
    const proxIso = new Date(now.getTime() + 30 * DIA).toISOString()
    const insp: InspRow = {
      id: d.nextInspectionId++,
      tag: ext.tag,
      resultados,
      fallas,
      criticas_fallan: criticas.length > 0 ? 1 : 0,
      observaciones: body.observaciones !== undefined && body.observaciones !== null ? String(body.observaciones).slice(0, 4000) : null,
      foto: body.foto_evidencia_base64 ? String(body.foto_evidencia_base64).slice(0, 4_000_000) : null,
      lat: ext.lat,
      lng: ext.lng,
      dispositivo: body.dispositivo !== undefined ? String(body.dispositivo).slice(0, 128) : null,
      inspector_id: user!.id,
      inspector_username: user!.username,
      created_at: nowIso,
    }
    if (body.gps && typeof body.gps === 'object') {
      const g = body.gps as Record<string, unknown>
      const la = Number(g.lat)
      const lo = Number(g.lng)
      if (Number.isFinite(la) && la >= -90 && la <= 90) insp.lat = la
      if (Number.isFinite(lo) && lo >= -180 && lo <= 180) insp.lng = lo
    }
    if (insp.lat !== null) ext.lat = insp.lat
    if (insp.lng !== null) ext.lng = insp.lng
    d.inspecciones.push(insp)
    ext.ultima_inspeccion = nowIso
    ext.proximo_vencimiento = proxIso
    ext.estado_inspeccion = estado_inspeccion
    ext.rechazado = rechazado
    ext.updated_at = nowIso
    guardar()
    return json(201, {
      id: insp.id,
      tag: ext.tag,
      fecha: nowIso,
      proximo_vencimiento: proxIso,
      resultados,
      fallas,
      criticas,
      estado_inspeccion,
      rechazado: rechazado === 1,
      extintor: {
        tag: ext.tag,
        ultima_inspeccion: ext.ultima_inspeccion,
        proximo_vencimiento: ext.proximo_vencimiento,
        estado_inspeccion: ext.estado_inspeccion,
        rechazado: ext.rechazado,
      },
    })
  }
  if (rest === '/inspections' && method === 'GET') {
    const { page, size, offset } = paginate(q)
    const tagF = q.get('tag') ? q.get('tag')!.toUpperCase() : ''
    const desde = q.get('desde') ? parseTs(q.get('desde')) : NaN
    const hasta = q.get('hasta') ? parseTs(q.get('hasta')) : NaN
    let rows = d.inspecciones.slice()
    if (tagF) rows = rows.filter((r) => r.tag === tagF)
    if (!Number.isNaN(desde)) rows = rows.filter((r) => Date.parse(r.created_at) >= desde)
    if (!Number.isNaN(hasta)) rows = rows.filter((r) => Date.parse(r.created_at) <= hasta)
    rows.sort((a, b) => b.id - a.id)
    const items = rows.slice(offset, offset + size).map(({ foto, ...r }) => ({ ...r, tiene_foto: Boolean(foto) }))
    return json(200, { items, total: rows.length, page, size })
  }
  if (rest.startsWith('/inspections/')) {
    const id = Number(rest.slice('/inspections/'.length))
    const r = d.inspecciones.find((x) => x.id === id)
    if (!r) return err(404, 'not_found', 'Inspección no encontrada')
    return json(200, { ...r })
  }

  // --- alertas / export ---
  if (rest === '/alerts/panel' && method === 'GET') return json(200, panelData())
  if (rest === '/alerts/replacement-list.csv' && method === 'GET') {
    const panel = panelData() as unknown as { rojo: Array<Record<string, unknown>>; negro: Array<Record<string, unknown>> }
    const rows = [...panel.rojo, ...panel.negro].sort((a, b) => String(a.tag).localeCompare(String(b.tag)))
    const header = ['tag', 'ubicacion', 'tipo', 'capacidad_l', 'proximo_vencimiento', 'motivo']
    const lines = [header.join(',')]
    for (const r of rows) {
      lines.push(
        [r.tag, r.ubicacion, r.tipo, r.capacidad_l, r.proximo_vencimiento, r.estadoCalculado === 'rechazado' ? 'rechazado' : 'vencido']
          .map(csvCell)
          .join(','),
      )
    }
    const stamp = iso(Date.now()).slice(0, 10)
    return new Response(lines.join('\n') + '\n', {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="reemplazo-extintores-${stamp}.csv"`,
      },
    })
  }
  if (rest === '/export/extinguishers.xlsx' && method === 'GET') return await xlsxResponse()
  if (rest === '/integration/status' && method === 'GET') {
    return json(200, {
      mode: 'off',
      selfDriver: 'demo (localStorage)',
      clientDb: { driver: 'postgres', url: null, configurado: false },
      referencia: { activo: false, listas: [] },
      espejo: { activo: false, mapeos: [], pendientes: 0 },
      pendientesNota: 'demo sin conexión: la integración se configura por ENV del server real',
    })
  }
  if (rest === '/integration/test' && method === 'POST') {
    const dr = String((body as { driver?: string }).driver || '')
    if (dr === 'sqlserver' || dr === 'oracle') return err(501, 'connector_pending', `conector ${dr}: pendiente de implementación (contribuya) — ver PRODUCT-LINE.md §Deuda conocida`)
    return err(400, 'demo_mode', 'En el demo sin servidor no hay BD del cliente que probar; use la instalación local (docker/portable).')
  }
  if (rest === '/alerts/webhook-test' && method === 'POST') {
    const e = solo('admin')
    if (e) return e
    if (!d.settings.webhookUrl) return err(400, 'not_configured', 'webhookUrl no está configurado en /settings')
    return json(200, { ok: true, status: 200 })
  }

  // --- settings ---
  if (rest === '/settings' && method === 'GET') {
    const e = solo('admin')
    if (e) return e
    return json(200, JSON.parse(JSON.stringify(d.settings)))
  }
  if (rest === '/settings' && method === 'PATCH') {
    const e = solo('admin')
    if (e) return e
    const s = d.settings
    if (body.appName !== undefined) {
      const v = String(body.appName).trim().slice(0, 80)
      if (!v) return err(400, 'bad_request', 'appName inválido')
      s.appName = v
    }
    if (body.logoDataUrl !== undefined) {
      const v = String(body.logoDataUrl)
      if (v !== '' && !v.startsWith('data:image/')) return err(400, 'bad_request', 'logoDataUrl debe ser un data URL de imagen base64')
      if (v.length > 1_500_000) return err(400, 'bad_request', 'logoDataUrl demasiado grande (máx 1.5M chars)')
      s.logoDataUrl = v
    }
    if (body.temaDefault !== undefined) {
      if (body.temaDefault !== 'dark' && body.temaDefault !== 'light') return err(400, 'bad_request', 'temaDefault debe ser dark o light')
      s.temaDefault = body.temaDefault
    }
    if (body.webhookUrl !== undefined) {
      const v = String(body.webhookUrl).trim()
      if (v && !/^https?:\/\//.test(v)) return err(400, 'bad_request', 'webhookUrl debe iniciar con http:// o https://')
      s.webhookUrl = v
    }
    if (body.webhookApi !== undefined) s.webhookApi = String(body.webhookApi).slice(0, 256)
    if (body.brand !== undefined && typeof body.brand === 'object' && body.brand !== null) {
      const b = body.brand as Record<string, unknown>
      for (const k of ['primary', 'ok', 'warn', 'err', 'info'] as const) {
        if (b[k] !== undefined) {
          if (!COLOR_RE.test(String(b[k]))) return err(400, 'bad_request', `brand.${k} debe ser un color hex (#rgb, #rrggbb)`)
          s.brand[k] = String(b[k])
        }
      }
    }
    for (const lk of ['configTipos', 'configUbicaciones'] as const) {
      if (body[lk] !== undefined) {
        if (!Array.isArray(body[lk])) return err(400, 'bad_request', `${lk} debe ser un array de strings`)
        const arr = (body[lk] as unknown[]).map((v) => String(v).trim().slice(0, 80)).filter((v) => v)
        if (arr.length > 100) return err(400, 'bad_request', `${lk} admite máximo 100 valores`)
        s[lk] = Array.from(new Set(arr))
      }
    }
    guardar()
    return json(200, JSON.parse(JSON.stringify(s)))
  }

  return err(404, 'not_found', `Ruta demo no implementada: ${method} ${rest}`)
}

// ---------- instalación del parche fetch ----------

let instalado = false

/**
 * Parcha window.fetch: lo que apunte a API_BASE se resuelve con demoMock (latencia 150 ms);
 * el resto pasa al fetch original. Así api.get/post/patch/del y los fetch crudos de
 * descargas/AlertsPage enrután a demoMock SIN tocar ningún llamador.
 */
export function installDemoFetch(apiBase: string): void {
  if (instalado || typeof window === 'undefined') return
  instalado = true
  const original = window.fetch.bind(window)
  window.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (url.startsWith(apiBase)) {
      return sleep(LATENCIA_MS)
        .then(() => handleDemo(url.slice(apiBase.length) || '/', init))
        .catch((e: unknown) =>
          err(500, 'demo_error', e instanceof Error ? e.message : String(e)),
        )
    }
    return original(input as RequestInfo, init)
  }) as typeof window.fetch
  // expone un botón de reset para demos: window.__brigadaDemoReset()
  ;(window as unknown as Record<string, unknown>).__brigadaDemoReset = (): void => {
    db = null
    try {
      localStorage.removeItem(DB_KEY)
    } catch {
      /* noop */
    }
    cargarDb()
  }
}
