'use strict';
// Smoke E2E del retrofit "suite-local v1" (spec brigada-cliente-local.md).
// Tres fases secuenciales en el MISMO puerto (SMOKE_PORT, default 3200 — asignado a
// brigada por el coordinador; solo se mata $! propio):
//   MAIN        : dominio NFPA + admin + integración (status/test 501/502, cred no persist)
//   REFERENCIA  : selectores + alta masiva de 20 extintores desde fixture sqlite del cliente
//   ESPEJO      : inspección rechazada → filas en destino al flush; destino caído → pendiente
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.SMOKE_PORT || '3200', 10);
const BASE = `http://127.0.0.1:${PORT}`;

const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

function launch(extraEnv) {
  const env = {
    ...process.env, PORT: String(PORT), DB_DRIVER: 'sqlite', NODE_ENV: 'test',
    DB_URL: extraEnv.DB_URL, INTEGRATION_MODE: 'off', CLIENT_DB_URL: '', CLIENT_DB_DRIVER: 'postgres',
    INTEGRATION_REF_LISTS: '{}', INTEGRATION_IMPORT_MAP: '{}', ESPEJO_INTERVAL_MS: '999999', ...extraEnv
  };
  delete env.INTEGRATION_MODE_OVERRIDE;
  const seed = spawnSync('node', ['seeds/seed.js'], { cwd: ROOT, env, encoding: 'utf8' });
  if (seed.status !== 0) { console.error('seed falló:', seed.stderr || seed.stdout); process.exit(1); }
  const server = spawn('node', ['src/server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  return server;
}

async function waitUp() {
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try { const r = await fetch(`${BASE}/health`); if (r.ok) return true; } catch (_) { /* aún no */ }
  }
  return false;
}

async function killServer(server) {
  if (!server) return;
  server.kill();
  await new Promise((r) => { server.once('exit', r); setTimeout(r, 3000); });
}

const JH = (tk) => ({ Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' });
async function login(user, pass) {
  const r = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: user, password: pass }) });
  const j = await r.json();
  if (!j.token) throw new Error(`login ${user} falló: ${JSON.stringify(j)}`);
  return j.token;
}

const DIA_MS = 86400000, ANIO_MS = 365.25 * DIA_MS, MES_MS = 30.44 * DIA_MS;
function iso(offsetMs) { return new Date(Date.now() + offsetMs).toISOString(); }

// ------------------------------------------------------------------ MAIN ------
async function phaseMain(tmp) {
  let server = null;
  try {
    server = launch({ DB_URL: path.join(tmp, 'main.db') });
    if (!await waitUp()) { check('MAIN server levanta', false); return; }
    check('MAIN server levanta (health)', true);

    let r = await fetch(`${BASE}/api/v1/public-config`);
    const cfg = await r.json();
    check('GET /public-config sin auth', r.status === 200 && !!cfg.appName, `appName=${cfg.appName}`);
    check('Criterio 15: tema claro default en settings', cfg.temaDefault === 'light', `temaDefault=${cfg.temaDefault}`);

    r = await fetch(`${BASE}/api/v1/extinguishers`);
    check('GET /extinguishers sin token -> 401', r.status === 401);

    const tk = await login('inspector', '1nsp3ct0r');
    const H = JH(tk);
    r = await fetch(`${BASE}/api/v1/extinguishers?size=100`, { headers: H });
    const list = await r.json();
    check('GET /extinguishers con token (40 items)', r.status === 200 && list.total === 40, `total=${list.total}`);

    r = await fetch(`${BASE}/api/v1/checklist-items`, { headers: H });
    const chk = await r.json();
    const critSet = chk.filter((c) => c.critico === 1).map((c) => c.clave).sort();
    check('Criterio 2: críticos NFPA §7.2 en checklist (critico=1 desde BD)',
      JSON.stringify(critSet) === JSON.stringify(['manguera_sin_fisuras', 'manometro_rango', 'precinto_intacto']), critSet.join(','));

    r = await fetch(`${BASE}/api/v1/extinguishers`, { method: 'POST', headers: H, body: JSON.stringify({ tag: 'EXTF-SMOKE-1', ubicacion: 'Pasillo smoke' }) });
    check('POST /extinguishers como inspector -> 403', r.status === 403);

    // Criterio 5: brigadista con habilitación vencida -> 403 con motivo
    const tkBrig = await login('brigadista', 'Br1g@d1st4!');
    const resOk = {}; for (const c of chk) resOk[c.clave] = true;
    r = await fetch(`${BASE}/api/v1/inspections`, { method: 'POST', headers: JH(tkBrig), body: JSON.stringify({ tag: 'EXTF-COC-021', resultados: resOk }) });
    const j403 = await r.json();
    check('Criterio 5: brigadista sin habilitación vigente -> 403 habilitacion_vencida', r.status === 403 && j403.error === 'habilitacion_vencida', j403.msg);

    // Criterio 3: falla manometro_rango -> rechazado + negro + webhook intentado
    const res = {}; for (const c of chk) res[c.clave] = true;
    res.manometro_rango = false;
    const target = 'EXTF-COC-021';
    r = await fetch(`${BASE}/api/v1/inspections`, { method: 'POST', headers: H, body: JSON.stringify({ tag: target, resultados: res, observaciones: 'smoke: manómetro fuera de rango' }) });
    const insp = await r.json();
    check('Criterio 3: falla manometro_rango -> rechazado=true', r.status === 201 && insp.rechazado === true && insp.criticas.includes('manometro_rango'), `criticas=${JSON.stringify(insp.critas || insp.criticas)}`);

    r = await fetch(`${BASE}/api/v1/alerts/panel`, { headers: H });
    const panel = await r.json();
    check('Criterio 3: rechazado en semáforo negro', (panel.negro || []).some((x) => x.tag === target), `negro=${panel.negro.length} cont=${JSON.stringify(panel.cont)}`);

    // Criterio 5 (parte b): supervisor exento puede firmar; queda nota de auditoría
    const tkSup = await login('supervisor', 'sup3rv1s0r');
    r = await fetch(`${BASE}/api/v1/inspections`, { method: 'POST', headers: JH(tkSup), body: JSON.stringify({ tag: 'EXTF-ALM-022', resultados: resOk }) });
    const stSup = r.status;
    const inspSup = await r.json();
    r = await fetch(`${BASE}/api/v1/inspections/${inspSup.id}`, { headers: JH(tkSup) });
    const inspRow = await r.json();
    check('Criterio 5b: supervisor firma sin habilitación obligatoria + nota de auditoría',
      stSup === 201 && r.status === 200 && inspSup.habilitacion === 'exenta_supervisor' && inspRow.habilitacion === 'exenta_supervisor',
      `post=${stSup} hab=${inspSup.habilitacion} fila=${inspRow && inspRow.habilitacion}`);

    // Criterio 4 (e2e): hidroestática por fecha de fabricación manda
    const AH = JH(await login('admin', 'Br1g@d4!n'));
    for (const [tag, agente, fabMs, esperado] of [
      ['EXT-SMOKE-PQS-Y', 'PQS', -(12 * ANIO_MS - 22 * DIA_MS), 'por_vencer'],
      ['EXT-SMOKE-PQS-R', 'PQS', -(12 * ANIO_MS + 5 * DIA_MS), 'vencido'],
      ['EXT-SMOKE-CO2-Y', 'CO2', -(5 * ANIO_MS - 22 * DIA_MS), 'por_vencer'],
      ['EXT-SMOKE-CO2-R', 'CO2', -(5 * ANIO_MS + 5 * DIA_MS), 'vencido']
    ]) {
      r = await fetch(`${BASE}/api/v1/extinguishers`, {
        method: 'POST', headers: AH,
        body: JSON.stringify({ tag, ubicacion: 'Depos, de prueba (zona, rara)', tipo: 'SMOKE', agente, fecha_fabricacion: iso(fabMs), ultima_inspeccion: iso(-DIA_MS), proximo_vencimiento: iso(29 * DIA_MS) })
      });
      const crea = await r.json();
      check(`Criterio 4 e2e: ${agente} fabricada hace ${(Math.abs(fabMs) / ANIO_MS).toFixed(2)} a -> ${esperado}`,
        r.status === 201 && crea.estadoCalculado === esperado && crea.motivoVencimiento === 'hidrostatica', `${crea.estadoCalculado}/${crea.motivoVencimiento}`);
    }
    r = await fetch(`${BASE}/api/v1/extinguishers?area=Depos&size=50`, { headers: AH });
    const filtradas = await r.json();
    check('Filtro por área (extintores?area=) devuelve las 4 de prueba', filtradas.total === 4, `total=${filtradas.total}`);

    // Criterio 9: CSV agrupado por área, ordenado por urgencia, escapando comas
    r = await fetch(`${BASE}/api/v1/alerts/replacement-list.csv`, { headers: AH });
    const csv = await r.text();
    const lineas = csv.trim().split('\n');
    const deposLines = lineas.filter((l) => l.startsWith('"Depos, de prueba",'));
    check('Criterio 9: CSV con área + urgencia + escape de comas',
      r.status === 200 && lineas[0].startsWith('area,tag,ubicacion') &&
      deposLines.length >= 2 && deposLines.every((l) => /,vencido,[0-9]+$/.test(l)), deposLines[0] ? deposLines[0].slice(0, 110) : 'sin filas Depos');

    // Criterio 10: XLSX con color, columnas NFPA y firma de versión
    r = await fetch(`${BASE}/api/v1/export/extinguishers.xlsx`, { headers: AH });
    const buf = Buffer.from(await r.arrayBuffer());
    check('Criterio 10: XLSX (PK)', r.status === 200 && buf[0] === 0x50 && buf[1] === 0x4b, `${buf.length} bytes`);
    try {
      const ExcelJS = require('exceljs');
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(buf);
      const ws = wb.getWorksheet('Extintores');
      const heads = ws.getRow(1).values.map(String);
      const estadoCol = heads.findIndex((h) => /Estado calculado/i.test(h));
      let pintada = false, version = '';
      ws.eachRow((row, n) => {
        if (n === 1) return;
        const c = row.getCell(estadoCol);
        const j = JSON.stringify({ f: c.font, fill: c.fill });
        if (/FF(22C55E|EAB308|EF4444|000000|9CA3AF)/i.test(j)) pintada = true;
        if (String(row.getCell(1).value || '').includes('xlsx-v1.1')) version = String(row.getCell(1).value);
      });
      check('Criterio 10: columnas NFPA (agente, recarga, hidrostática)', heads.some((h) => /Agente/i.test(h)) && heads.some((h) => /hidrost/i.test(h)) && heads.some((h) => /recarga/i.test(h)), heads.slice(0, 9).join('|'));
      check('Criterio 10: celda de estado coloreada por semáforo', pintada);
      check('Criterio 10: firma de versión en el libro', /xlsx-v1\.1/.test(version) && /xlsx-v1\.1/.test(String(wb.description)), version.slice(0, 40));
    } catch (e) { check('Criterio 10: parse XLSX', false, e.message); }

    // Integración (admin): status, roles, test de conexión, 501, 502, credenciales no persistidas
    r = await fetch(`${BASE}/api/v1/integration/status`, { headers: AH });
    const integ = await r.json();
    check('GET /integration/status (admin, modo off)', r.status === 200 && integ.mode === 'off', JSON.stringify(integ.clientDb));
    r = await fetch(`${BASE}/api/v1/integration/status`, { headers: H });
    check('GET /integration/status como inspector -> 403', r.status === 403);
    r = await fetch(`${BASE}/api/v1/integration/test`, { method: 'POST', headers: AH, body: JSON.stringify({ driver: 'sqlserver', url: 'server=x' }) });
    check('Criterio 12: POST /integration/test sqlserver -> 501 conector pendiente', r.status === 501);
    r = await fetch(`${BASE}/api/v1/integration/test`, { method: 'POST', headers: AH, body: JSON.stringify({ driver: 'oracle', url: 'x' }) });
    check('POST /integration/test oracle -> 501', r.status === 501);
    r = await fetch(`${BASE}/api/v1/integration/test`, { method: 'POST', headers: AH, body: JSON.stringify({ driver: 'postgres', url: 'postgres://no:TOPSECRET@127.0.0.1:1/base' }) });
    check('POST /integration/test postgres inválida -> 502', r.status === 502);

    // Test de conexión contra fixture sqlite real (misma herramienta del admin)
    const fixCli = path.join(tmp, 'cliente_ro.sqlite');
    const BS = require('better-sqlite3');
    const fx = new BS(fixCli);
    fx.exec("CREATE TABLE equipos_contraincendio (cod_equipo TEXT, descripcion TEXT, area TEXT, agente TEXT, capacidad_kg REAL, fecha_fabricacion TEXT)");
    fx.close();
    r = await fetch(`${BASE}/api/v1/integration/test`, { method: 'POST', headers: AH, body: JSON.stringify({ driver: 'sqlite', url: fixCli }) });
    const tSqlite = await r.json();
    check('Criterio 12: test-conexión sqlite sobre fixture lista tablas', r.status === 200 && tSqlite.ok === true && tSqlite.tables.includes('equipos_contraincendio'), JSON.stringify(tSqlite.tables));

    await killServer(server); server = null;
    // Criterio NORMA 3: credenciales jamás persistidas (settings no contiene TOPSECRET)
    const dbCheck = new BS(path.join(tmp, 'main.db'), { readonly: true });
    const rows = dbCheck.prepare("SELECT svalue FROM settings WHERE svalue LIKE '%TOPSECRET%' OR svalue LIKE '%postgres://%'").all();
    check('Credenciales de prueba NO persistidas en settings', rows.length === 0, `coincidencias=${rows.length}`);
    dbCheck.close();
  } finally {
    await killServer(server);
  }
}

// ---------------------------------------------------------- REFERENCIA --------
async function phaseReferencia(tmp) {
  let server = null;
  try {
    const fixCli = path.join(tmp, 'cliente_ref.sqlite');
    const BS = require('better-sqlite3');
    const fx = new BS(fixCli);
    fx.exec("CREATE TABLE equipos_contraincendio (cod_equipo TEXT, descripcion TEXT, area TEXT, agente TEXT, capacidad_kg REAL, fecha_fabricacion TEXT)");
    const ins = fx.prepare('INSERT INTO equipos_contraincendio VALUES (?,?,?,?,?,?)');
    for (let i = 1; i <= 20; i++) {
      ins.run(`EQ-${String(i).padStart(3, '0')}`, `Extintor demo ${i} (maestro cliente)`, i % 2 ? 'Nave A' : 'Nave B',
        i % 3 === 0 ? 'CO2' : 'PQS', 6.0, iso(-(3 * 365 * DIA_MS)));
    }
    fx.close();

    server = launch({
      DB_URL: path.join(tmp, 'ref.db'),
      INTEGRATION_MODE: 'referencia', CLIENT_DB_DRIVER: 'sqlite', CLIENT_DB_URL: fixCli,
      INTEGRATION_REF_LISTS: JSON.stringify({ equipos: { table: 'equipos_contraincendio', id: 'cod_equipo', label: 'descripcion' } }),
      INTEGRATION_IMPORT_MAP: JSON.stringify({ cod_equipo: 'tag', descripcion: 'notas', area: 'ubicacion', agente: 'agente', capacidad_kg: 'capacidad_l', fecha_fabricacion: 'fecha_fabricacion' })
    });
    if (!await waitUp()) { check('REFERENCIA server levanta', false); return; }
    const AH = JH(await login('admin', 'Br1g@d4!n'));

    let r = await fetch(`${BASE}/api/v1/integration/ref`, { headers: AH });
    const lst = await r.json();
    check('Modo referencia activo: GET /integration/ref lista "equipos"', r.status === 200 && lst.listas.includes('equipos'), JSON.stringify(lst.listas));

    r = await fetch(`${BASE}/api/v1/integration/ref/equipos`, { headers: AH });
    const ref = await r.json();
    check('Selector desde cliente: 20 equipos con id/label', r.status === 200 && ref.items.length === 20 && !!ref.items[0].label, `n=${ref.items.length}`);

    r = await fetch(`${BASE}/api/v1/integration/ref/equipos/importar`, { method: 'POST', headers: AH });
    const imp = await r.json();
    check('Criterio 13: alta masiva de 20 extintores desde referencia', r.status === 200 && imp.creados === 20, JSON.stringify(imp).slice(0, 120));

    r = await fetch(`${BASE}/api/v1/extinguishers/EQ-003`, { headers: AH });
    const eq3 = await r.json();
    check('Criterio 13: metadata correcta (agente CO2 desde maestro, notas, área)',
      r.status === 200 && eq3.agente === 'CO2' && eq3.ubicacion === 'Nave A' && eq3.metadata && eq3.metadata.origen === 'referencia', `ag=${eq3.agente} ub=${eq3.ubicacion} md=${JSON.stringify(eq3.metadata && eq3.metadata.origen)}`);

    r = await fetch(`${BASE}/api/v1/extinguishers?area=Nave%20B&size=50`, { headers: AH });
    const porArea = await r.json();
    check('Filtro por área del maestro (Nave B)', r.status === 200 && porArea.total === 10, `total=${porArea.total}`);
  } finally {
    await killServer(server);
  }
}

// --------------------------------------------------------------- ESPEJO -------
async function phaseEspejo(tmp) {
  let server = null;
  try {
    const destino = path.join(tmp, 'destino.sqlite');
    const BS = require('better-sqlite3');
    const dx = new BS(destino);
    dx.exec('CREATE TABLE reg_inspecciones (equipo_tag TEXT, fecha TEXT, usuario TEXT, rechazado INTEGER)');
    dx.exec('CREATE TABLE reg_rechazos (inspeccion_id INTEGER, equipo_tag TEXT, motivo TEXT)');
    dx.close();

    server = launch({ DB_URL: path.join(tmp, 'esp.db'), INTEGRATION_MODE: 'espejo', CLIENT_DB_DRIVER: 'sqlite', CLIENT_DB_URL: destino });
    if (!await waitUp()) { check('ESPEJO server levanta', false); return; }
    const AH = JH(await login('admin', 'Br1g@d4!n'));

    let r = await fetch(`${BASE}/api/v1/integration/espejo/mapeos`, {
      method: 'PUT', headers: AH,
      body: JSON.stringify({
        mapeos: [
          { origen: 'inspecciones', destino: 'reg_inspecciones', columnas: { tag: 'equipo_tag', fecha: 'fecha', inspector_username: 'usuario', rechazado: 'rechazado' } },
          { origen: 'rechazos', destino: 'reg_rechazos', columnas: { id: 'inspeccion_id', tag: 'equipo_tag', motivo: 'motivo' } }
        ]
      })
    });
    check('PUT /integration/espejo/mapeos (admin)', r.status === 200);

    const tk = await login('inspector', '1nsp3ct0r');
    const chk = (await (await fetch(`${BASE}/api/v1/checklist-items`, { headers: JH(tk) })).json());
    const res = {}; for (const c of chk) res[c.clave] = true;
    res.precinto_intacto = false; // crítico
    r = await fetch(`${BASE}/api/v1/inspections`, { method: 'POST', headers: JH(tk), body: JSON.stringify({ tag: 'EXTF-COC-021', resultados: res }) });
    const insp = await r.json();
    check('Criterio 14: inspección rechazada se registra (201)', r.status === 201 && insp.rechazado === true);

    r = await fetch(`${BASE}/api/v1/integration/espejo/flush`, { method: 'POST', headers: AH });
    const flush = await r.json();
    check('Criterio 14: flush envía inspección + rechazo al destino', r.status === 200 && flush.enviados >= 2 && flush.pendientes === 0, JSON.stringify(flush));
    const rd = new BS(destino, { readonly: true });
    const filas = rd.prepare('SELECT equipo_tag, rechazado FROM reg_inspecciones').all();
    const rechazos = rd.prepare('SELECT equipo_tag, motivo FROM reg_rechazos').all();
    rd.close();
    check('Criterio 14: filas escritas en tablas del cliente', filas.length === 1 && Number(filas[0].rechazado) === 1 && rechazos.length === 1 && /precinto/.test(rechazos[0].motivo), JSON.stringify({ filas, rechazos }).slice(0, 140));
    await killServer(server); server = null;

    // Destino caído: URL inválida → la inspección NO falla (UX intacta), queda pendiente.
    server = launch({ DB_URL: path.join(tmp, 'esp.db'), INTEGRATION_MODE: 'espejo', CLIENT_DB_URL: path.join(tmp, 'rota-no-existe', 'x.sqlite') });
    if (!await waitUp()) { check('ESPEJO (destino caído) server levanta', false); return; }
    const AH2 = JH(await login('admin', 'Br1g@d4!n'));
    const tk2 = await login('inspector', '1nsp3ct0r');
    r = await fetch(`${BASE}/api/v1/inspections`, { method: 'POST', headers: JH(tk2), body: JSON.stringify({ tag: 'EXTF-COC-021', resultados: res }) });
    const p201 = await r.json();
    check('Criterio 14b: destino caído NO bloquea la operación (201)', r.status === 201, `status=${r.status} ${JSON.stringify(p201).slice(0, 100)}`);
    r = await fetch(`${BASE}/api/v1/integration/espejo/flush`, { method: 'POST', headers: AH2 });
    const f2 = await r.json();
    check('Criterio 14b: destino caído → fila queda pendiente con error', r.status === 200 && f2.pendientes >= 1 && f2.fallidas >= 1, JSON.stringify(f2));
  } finally {
    await killServer(server);
  }
}

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brigada-smoke-'));
  let fatal = null;
  try {
    await phaseMain(tmp);
    await phaseReferencia(tmp);
    await phaseEspejo(tmp);
  } catch (e) { fatal = e; console.error('SMOKE ERROR:', e && e.stack ? e.stack : e); }
  finally {
    fs.rmSync(tmp, { recursive: true, force: true });
    const fails = results.filter((x) => !x.ok).length;
    console.log(`\nsmoke: ${results.length - fails}/${results.length} PASS`);
    process.exit(fails || fatal ? 1 : 0);
  }
}

main();
