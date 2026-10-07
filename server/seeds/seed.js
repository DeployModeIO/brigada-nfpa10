'use strict';
// Seed idempotente: usuarios, checklist y 40 extintores con fechas variadas.
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { migrate } = require('../src/db/migrate');

const USERS = [
  { username: 'admin', password: 'Br1g@d4!n', nombre: 'Administrador de Brigada', rol: 'admin' },
  { username: 'inspector', password: '1nsp3ct0r', nombre: 'Inspector de Brigada', rol: 'inspector' },
  { username: 'supervisor', password: 'sup3rv1s0r', nombre: 'Supervisor de Seguridad', rol: 'supervisor' },
  // Criterio 5: brigadista demo con habilitación VENCIDA (intenta firmar → 403 habilitacion_vencida).
  { username: 'brigadista', password: 'Br1g@d1st4!', nombre: 'Brigadista Demo', rol: 'inspector' }
];

// Checklist NFPA 10 §7.2 (spec §Reglas 1). Críticos CONFIGURADOS AQUÍ (DATOS, columna
// critico): manometro_rango, precinto_intacto, manguera_sin_fisuras ⇒ falla ⇒ rechazo ⇒
// alerta webhook. presion_rango/senaletica_visible/acceso_despejado/soporte_firme se
// conservan del modelo original (compatibilidad con datos e inspecciones previas).
const CHECKLIST = [
  { clave: 'presion_rango', etiqueta: 'Presión en rango (manómetro en verde) [clásico]', orden: 0, critico: 0 },
  { clave: 'visible_sin_obstaculos', etiqueta: 'Extintor visible y sin obstáculos (NFPA 10 §7.2)', orden: 1, critico: 0 },
  { clave: 'senaletica_altura', etiqueta: 'Señalética visible y manija ≤1,5 m del piso', orden: 2, critico: 0 },
  { clave: 'pasador_precinto', etiqueta: 'Pasador de seguridad presente', orden: 3, critico: 0 },
  { clave: 'manometro_rango', etiqueta: 'Manómetro en rango verde', orden: 4, critico: 1 },
  { clave: 'precinto_intacto', etiqueta: 'Precinto y pasador intactos', orden: 5, critico: 1 },
  { clave: 'manguera_sin_fisuras', etiqueta: 'Manguera/tobera sin fisuras', orden: 6, critico: 1 },
  { clave: 'cilindro_sin_corrosion', etiqueta: 'Cilindro sin corrosión ni abolladuras', orden: 7, critico: 0 },
  { clave: 'tarjeta_legible', etiqueta: 'Tarjeta de inspección legible y firmada', orden: 8, critico: 0 },
  { clave: 'api14g_clase_b_area_encerrada', etiqueta: 'API RP 14G: Clase B presente junto a motores/turbinas en área encerrada', orden: 9, critico: 0 },
  { clave: 'senaletica_visible', etiqueta: 'Señalética visible [clásico]', orden: 20, critico: 0 },
  { clave: 'acceso_despejado', etiqueta: 'Acceso despejado [clásico]', orden: 21, critico: 0 },
  { clave: 'soporte_firme', etiqueta: 'Soporte firme y señalizado [clásico]', orden: 22, critico: 0 }
];

// Reglas de vencimiento NFPA 10 como DATOS (criterio 2): mensual 30 d, recarga 12 m,
// hidrostática 5 a (CO2/agua/BC/K/AFFF) / 12 a (PQS acero); manda fecha de fabricación.
// AFFF: espuma acuosa estándar en instalaciones Oil & Gas (API RP 14G).
const REGLAS_NFPA = [
  { agente: '*', mensual_dias: 30, recarga_meses: 12, hidro_anios: 5, amarillo_insp_dias: 7, amarillo_largo_dias: 30, nota: 'Regla por defecto (extintores sin agente declarado)' },
  { agente: 'PQS', mensual_dias: 30, recarga_meses: 12, hidro_anios: 12, amarillo_insp_dias: 7, amarillo_largo_dias: 30, nota: 'Polvo químico seco, cilindro de acero: hidrostática 12 años' },
  { agente: 'CO2', mensual_dias: 30, recarga_meses: 12, hidro_anios: 5, amarillo_insp_dias: 7, amarillo_largo_dias: 30, nota: 'CO2: hidrostática 5 años' },
  { agente: 'AGUA', mensual_dias: 30, recarga_meses: 12, hidro_anios: 5, amarillo_insp_dias: 7, amarillo_largo_dias: 30, nota: 'Agua a presión: hidrostática 5 años' },
  { agente: 'BC', mensual_dias: 30, recarga_meses: 12, hidro_anios: 5, amarillo_insp_dias: 7, amarillo_largo_dias: 30, nota: 'Halon/BC sustituto: hidrostática 5 años' },
  { agente: 'K', mensual_dias: 30, recarga_meses: 12, hidro_anios: 5, amarillo_insp_dias: 7, amarillo_largo_dias: 30, nota: 'Acetato de potasio (cocina): hidrostática 5 años' },
  { agente: 'AFFF', mensual_dias: 30, recarga_meses: 12, hidro_anios: 5, amarillo_insp_dias: 7, amarillo_largo_dias: 30, nota: 'Espuma AFFF Oil & Gas (API RP 14G): hidrostática 5 años' }
];

// Habilitaciones de demo (criterio 5): inspector vigente, brigadista VENCIDA.
// Criterio 19: sin RUT en metadata/habilitaciones — solo referencia al usuario interno.
const TIPO_A_AGENTE = { ABC: 'PQS', BC: 'BC', CO2: 'CO2', PW: 'AGUA', FBQ: 'PQS', K: 'K', AFFF: 'AFFF' };

// Ubicaciones Oil & Gas (DEC BRIGADA-O&G): planta compresora, módulo POB offshore,
// tanques de almacenamiento, muelle de carguío, etc.
const UBICACIONES = [
  'Planta Compresora', 'Módulo POB (Personal Offshore)', 'Área de Tanques de Almacenamiento',
  'Muelle de Carguío', 'Taller de Mantenimiento', 'Subestación Eléctrica',
  'Almacén Químico', 'Sala de servidores', 'Cuarto de bombas contra incendio', 'Zona de despacho',
  'Rampa de carga', 'Helipuerto', 'Cocina del módulo', 'Oficinas', 'Perimetral sur',
  'Cuarto eléctrico', 'Estación de grimémetro', 'Bodega de inflamables', 'Patio de tanques', 'Punto de reunión'
];
const ZONAS = ['PCO', 'POB', 'TAN', 'MUE', 'TAL', 'SUB', 'AQU', 'DES', 'RAM', 'HEL'];
const TIPOS = ['ABC', 'BC', 'CO2', 'AFFF', 'PW'];

function dayOffset(days) { return new Date(Date.now() + days * 86400000).toISOString(); }
function round(n, d) { const p = Math.pow(10, d); return Math.round(n * p) / p; }

function buildExtintores() {
  const list = [];
  let seq = 0;
  const mk = (grupo, n, extra) => {
    seq += 1;
    const zona = ZONAS[(seq - 1) % ZONAS.length];
    const tag = `EXTF-${zona}-${String(n).padStart(3, '0')}`;
    return {
      tag,
      ubicacion: `${UBICACIONES[(seq - 1) % UBICACIONES.length]} (${grupo})`,
      tipo: TIPOS[seq % TIPOS.length],
      capacidad_l: [2.5, 4.5, 6, 9, 12][seq % 5],
      presion_bar: [13.5, 15, 17, 19][seq % 4],
      fecha_fabricacion: dayOffset(-(400 + seq * 11)),
      lat: round(-0.1833 + (seq % 20) * 0.0007 - 0.007, 5),
      lng: round(-78.4683 + (seq % 15) * 0.0009 - 0.006, 5),
      notas: null,
      ...extra
    };
  };

  // 20 vigentes: última inspección hace 2-22 días, vence en 8-28 días.
  for (let i = 1; i <= 20; i++) {
    list.push(mk('vigente', i, {
      ultima_inspeccion: dayOffset(-(i % 21 || 1)),
      proximo_vencimiento: dayOffset(30 - (i % 21 || 1)),
      estado_inspeccion: 'pasa', rechazado: 0
    }));
  }
  // 8 por vencer: vencen en 1-7 días.
  for (let i = 1; i <= 8; i++) {
    const d = (i % 7) || 1;
    list.push(mk('por_vencer', 20 + i, {
      ultima_inspeccion: dayOffset(d - 30),
      proximo_vencimiento: dayOffset(d),
      estado_inspeccion: 'pasa', rechazado: 0
    }));
  }
  // 7 vencidos.
  for (let i = 1; i <= 7; i++) {
    list.push(mk('vencido', 28 + i, {
      ultima_inspeccion: dayOffset(-30 - i * 2),
      proximo_vencimiento: dayOffset(-i * 2),
      estado_inspeccion: 'pasa', rechazado: 0
    }));
  }
  // 3 rechazados (falla crítica detectada).
  for (let i = 1; i <= 3; i++) {
    list.push(mk('rechazado', 35 + i, {
      ultima_inspeccion: dayOffset(-(i + 1)),
      proximo_vencimiento: dayOffset(29 - i),
      estado_inspeccion: 'falla', rechazado: 1, notas: 'Requiere recarga/reemplazo: falla crítica en inspección'
    }));
  }
  // 2 sin inspeccionar.
  for (let i = 1; i <= 2; i++) {
    list.push(mk('sin_inspeccion', 38 + i, {
      ultima_inspeccion: null, proximo_vencimiento: null,
      estado_inspeccion: 'n_a', rechazado: 0, notas: 'Unidad nueva, pendiente primera inspección'
    }));
  }
  return list;
}

async function runSeed() {
  await migrate();
  const now = new Date().toISOString();

  let created = 0, skipped = 0;
  // C1/A1 (fixes 03/10/2026): en producción NUNCA las credenciales del README.
  // Password aleatoria por usuario, impresa UNA vez como [SETUP]; en BD solo el hash.
  const credencialesRandom = process.env.NODE_ENV === 'production' && process.env.DEMO_SEED !== '1';
  for (const u of USERS) {
    const exists = await db.get('SELECT id FROM users WHERE username = ?', [u.username]);
    if (exists) { skipped++; continue; }
    const pass = credencialesRandom ? require('crypto').randomBytes(12).toString('base64url') : u.password;
    await db.run(
      'INSERT INTO users (username, password_hash, nombre, rol, activo, status, must_change_password, created_at) VALUES (?, ?, ?, ?, 1, ?, ?, ?)',
      [u.username, bcrypt.hashSync(pass, 10), u.nombre, u.rol, 'activo', credencialesRandom ? 1 : 0, now]
    );
    if (credencialesRandom) console.log(`[SETUP] ${u.username} password: ${pass}`);
    created++;
  }
  console.log(`[seed] usuarios: ${created} creados, ${skipped} existentes (admin/inspector/supervisor)`);

  created = 0; skipped = 0;
  for (const c of CHECKLIST) {
    const exists = await db.get('SELECT id FROM checklist_items WHERE clave = ?', [c.clave]);
    if (exists) { skipped++; continue; }
    await db.run('INSERT INTO checklist_items (clave, etiqueta, orden, critico, activo) VALUES (?, ?, ?, ?, 1)', [c.clave, c.etiqueta, c.orden, c.critico ?? 0]);
    created++;
  }
  // Los 3 críticos del §7.2 quedan marcados incluso en DBs existentes (idempotente).
  for (const ck of ['manometro_rango', 'precinto_intacto', 'manguera_sin_fisuras']) {
    await db.run('UPDATE checklist_items SET critico = 1 WHERE clave = ?', [ck]);
  }
  console.log(`[seed] checklist: ${created} creados, ${skipped} existentes (críticos §7.2: manometro_rango, precinto_intacto, manguera_sin_fisuras)`);

  created = 0; skipped = 0;
  for (const r of REGLAS_NFPA) {
    const exists = await db.get('SELECT agente FROM nfpa_reglas WHERE agente = ?', [r.agente]);
    if (exists) { skipped++; continue; }
    await db.run(
      'INSERT INTO nfpa_reglas (agente, mensual_dias, recarga_meses, hidro_anios, amarillo_insp_dias, amarillo_largo_dias, nota) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [r.agente, r.mensual_dias, r.recarga_meses, r.hidro_anios, r.amarillo_insp_dias, r.amarillo_largo_dias, r.nota]
    );
    created++;
  }
  console.log(`[seed] reglas NFPA: ${created} creadas, ${skipped} existentes`);

  // Habilitaciones demo: inspector vigente 180 d; brigadista vencida hace 10 d.
  const idIns = await db.get('SELECT id FROM users WHERE username = ?', ['inspector']);
  const idBrig = await db.get('SELECT id FROM users WHERE username = ?', ['brigadista']);
  const idSup = await db.get('SELECT id FROM users WHERE username = ?', ['supervisor']);
  for (const [u, hasta] of [[idIns, dayOffset(180)], [idSup, dayOffset(180)], [idBrig, dayOffset(-10)]]) {
    if (!u) continue;
    const exists = await db.get('SELECT id FROM habilitaciones WHERE brigadista_user_id = ? AND tipo_equipo = ?', [u.id, '*']);
    if (exists) continue;
    const habSql = "INSERT INTO habilitaciones (brigadista_user_id, tipo_equipo, vigente_hasta, certificado, activo, created_at) VALUES (?, ?, ?, ?, 1, ?)";
    const habCert = 'CERT-DEMO-' + u.id + '-' + hasta.slice(0, 10);
    await db.run(habSql, [u.id, '*', hasta, habCert, now]);
  }
  console.log('[seed] habilitaciones demo: inspector/supervisor vigentes, brigadista vencida (criterio 5)');

  created = 0; skipped = 0;
  for (const e of buildExtintores()) {
    const exists = await db.get('SELECT tag FROM extintores WHERE tag = ?', [e.tag]);
    if (exists) { skipped++; continue; }
    const agente = TIPO_A_AGENTE[e.tipo] || '';
    await db.run(
      `INSERT INTO extintores
        (tag, ubicacion, tipo, agente, capacidad_l, presion_bar, fecha_fabricacion, ultima_inspeccion,
         proximo_vencimiento, estado_inspeccion, rechazado, notas, lat, lng, activo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [e.tag, e.ubicacion, e.tipo, agente, e.capacidad_l, e.presion_bar, e.fecha_fabricacion, e.ultima_inspeccion,
        e.proximo_vencimiento, e.estado_inspeccion, e.rechazado, e.notas, e.lat, e.lng, now, now]
    );
    created++;
  }
  // DBs previas a 004: poblar agente desde tipo (idempotente).
  for (const [t, ag] of Object.entries(TIPO_A_AGENTE)) {
    await db.run(`UPDATE extintores SET agente = '${ag}' WHERE tipo = ? AND (agente IS NULL OR agente = '')`, [t]);
  }
  console.log(`[seed] extintores: ${created} creados, ${skipped} existentes (total 40: 20 vigentes, 8 por vencer, 7 vencidos, 3 rechazados, 2 sin inspeccionar)`);
}

if (require.main === module) {
  runSeed()
    .then(() => db.close())
    .then(() => process.exit(0))
    .catch((e) => { console.error('[seed] error:', e); process.exit(1); });
}

module.exports = { runSeed };
