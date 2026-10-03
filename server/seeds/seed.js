'use strict';
// Seed idempotente: usuarios, checklist y 40 extintores con fechas variadas.
const bcrypt = require('bcryptjs');
const db = require('../src/db');
const { migrate } = require('../src/db/migrate');

const USERS = [
  { username: 'admin', password: 'Br1g@d4!n', nombre: 'Administrador de Brigada', rol: 'admin' },
  { username: 'inspector', password: '1nsp3ct0r', nombre: 'Inspector de Brigada', rol: 'inspector' },
  { username: 'supervisor', password: 'sup3rv1s0r', nombre: 'Supervisor de Seguridad', rol: 'supervisor' }
];

// Clave "senalética_visible" se normaliza a ASCII: senaletica_visible.
const CHECKLIST = [
  { clave: 'presion_rango', etiqueta: 'Presión en rango (manómetro en verde)', orden: 1 },
  { clave: 'precinto_intacto', etiqueta: 'Precinto y pasador intactos', orden: 2 },
  { clave: 'manguera_sin_fisuras', etiqueta: 'Manguera/soplete sin fisuras', orden: 3 },
  { clave: 'senaletica_visible', etiqueta: 'Señalética visible', orden: 4 },
  { clave: 'acceso_despejado', etiqueta: 'Acceso despejado', orden: 5 },
  { clave: 'soporte_firme', etiqueta: 'Soporte firme y señalizado', orden: 6 }
];

const UBICACIONES = [
  'Pasillo norte', 'Bodega A', 'Oficinas 2do piso', 'Laboratorio', 'Comedor',
  'Estacionamiento', 'Cuarto eléctrico', 'Almacén de químicos', 'Recepción', 'Taller mecánico',
  'Rampa de carga', 'Sala de servidores', 'Cocina', 'Archivamiento', 'Patio central',
  'Cuarto de bombas', 'Zona de despacho', 'Escalera B', 'Perimetral sur', 'Subestación'
];
const ZONAS = ['COC', 'ALM', 'OFI', 'LAB', 'VEH', 'EXP', 'POR', 'TAL', 'REC', 'SER'];
const TIPOS = ['ABC', 'BC', 'CO2', 'PW', 'FBQ'];

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
  for (const u of USERS) {
    const exists = await db.get('SELECT id FROM users WHERE username = ?', [u.username]);
    if (exists) { skipped++; continue; }
    await db.run(
      'INSERT INTO users (username, password_hash, nombre, rol, activo, created_at) VALUES (?, ?, ?, ?, 1, ?)',
      [u.username, bcrypt.hashSync(u.password, 10), u.nombre, u.rol, now]
    );
    created++;
  }
  console.log(`[seed] usuarios: ${created} creados, ${skipped} existentes (admin/inspector/supervisor)`);

  created = 0; skipped = 0;
  for (const c of CHECKLIST) {
    const exists = await db.get('SELECT id FROM checklist_items WHERE clave = ?', [c.clave]);
    if (exists) { skipped++; continue; }
    await db.run('INSERT INTO checklist_items (clave, etiqueta, orden, activo) VALUES (?, ?, ?, 1)', [c.clave, c.etiqueta, c.orden]);
    created++;
  }
  console.log(`[seed] checklist: ${created} creados, ${skipped} existentes`);

  created = 0; skipped = 0;
  for (const e of buildExtintores()) {
    const exists = await db.get('SELECT tag FROM extintores WHERE tag = ?', [e.tag]);
    if (exists) { skipped++; continue; }
    await db.run(
      `INSERT INTO extintores
        (tag, ubicacion, tipo, capacidad_l, presion_bar, fecha_fabricacion, ultima_inspeccion,
         proximo_vencimiento, estado_inspeccion, rechazado, notas, lat, lng, activo, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [e.tag, e.ubicacion, e.tipo, e.capacidad_l, e.presion_bar, e.fecha_fabricacion, e.ultima_inspeccion,
        e.proximo_vencimiento, e.estado_inspeccion, e.rechazado, e.notas, e.lat, e.lng, now, now]
    );
    created++;
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
