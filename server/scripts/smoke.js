'use strict';
// Smoke test end-to-end: levanta servidor en puerto propio con BD temporal en /tmp.
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PORT = parseInt(process.env.SMOKE_PORT || '3210', 10);
const BASE = `http://127.0.0.1:${PORT}`;

function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'nfpa-smoke-'));
  const env = { ...process.env, PORT: String(PORT), DB_DRIVER: 'sqlite', DB_URL: path.join(tmp, 'smoke.db'), NODE_ENV: 'test' };

  const seed = spawnSync('node', ['seeds/seed.js'], { cwd: ROOT, env, encoding: 'utf8' });
  if (seed.status !== 0) { console.error('seed falló:', seed.stderr); process.exit(1); }

  const server = spawn('node', ['src/server.js'], { cwd: ROOT, env, stdio: 'ignore' });
  const results = [];
  const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };

  (async () => {
    let up = false;
    for (let i = 0; i < 40 && !up; i++) {
      await new Promise((r) => setTimeout(r, 250));
      try { const r = await fetch(`${BASE}/health`); up = r.ok; } catch (_) { /* aún no */ }
    }
    if (!up) { console.error('El servidor no levantó'); server.kill(); process.exit(1); }

    try {
      let r = await fetch(`${BASE}/api/v1/public-config`);
      const cfg = await r.json();
      check('GET /public-config sin auth', r.status === 200 && !!cfg.appName, `appName=${cfg.appName}`);

      r = await fetch(`${BASE}/api/v1/extinguishers`);
      check('GET /extinguishers sin token -> 401', r.status === 401);

      r = await fetch(`${BASE}/api/v1/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'inspector', password: '1nsp3ct0r' }) });
      const login = await r.json();
      check('POST /auth/login inspector', r.status === 200 && !!login.token);
      const tk = login.token;
      const H = { Authorization: `Bearer ${tk}`, 'Content-Type': 'application/json' };

      r = await fetch(`${BASE}/api/v1/extinguishers?size=100`, { headers: H });
      const list = await r.json();
      check('GET /extinguishers con token (40 items)', r.status === 200 && list.total === 40, `total=${list.total}`);

      r = await fetch(`${BASE}/api/v1/extinguishers`, { method: 'POST', headers: H, body: JSON.stringify({ tag: 'EXTF-SMOKE-1', ubicacion: 'Pasillo smoke' }) });
      check('POST /extinguishers como inspector -> 403', r.status === 403);

      r = await fetch(`${BASE}/api/v1/checklist-items`, { headers: H });
      const chk = await r.json();
      const res = {}; for (const c of chk) res[c.clave] = true;
      res.presion_rango = false;

      const target = 'EXTF-COC-021'; // uno de los por vencer
      r = await fetch(`${BASE}/api/v1/inspections`, { method: 'POST', headers: H, body: JSON.stringify({ tag: target, resultados: res, observaciones: 'smoke: presión fuera de rango' }) });
      const insp = await r.json();
      check('POST /inspections con falla crítica -> rechazado', r.status === 201 && insp.rechazado === true, JSON.stringify(insp.fallas));

      r = await fetch(`${BASE}/api/v1/alerts/panel`, { headers: H });
      const panel = await r.json();
      check('GET /alerts/panel incluye rechazado en negro', (panel.negro || []).some((x) => x.tag === target), `negro=${panel.negro.length} cont=${JSON.stringify(panel.cont)}`);

      r = await fetch(`${BASE}/api/v1/export/extinguishers.xlsx`, { headers: H });
      const buf = Buffer.from(await r.arrayBuffer());
      check('GET /export/extinguishers.xlsx (PK xlsx)', r.status === 200 && buf.length > 1000 && buf[0] === 0x50 && buf[1] === 0x4b, `${buf.length} bytes`);

      r = await fetch(`${BASE}/api/v1/alerts/replacement-list.csv`, { headers: H });
      const csv = await r.text();
      check('GET /alerts/replacement-list.csv', r.status === 200 && csv.startsWith('tag,ubicacion'), csv.split('\n')[1]);
    } finally {
      server.kill();
      fs.rmSync(tmp, { recursive: true, force: true });
      const fails = results.filter((x) => !x.ok).length;
      console.log(`\nsmoke: ${results.length - fails}/${results.length} PASS`);
      process.exit(fails ? 1 : 0);
    }
  })().catch((e) => { console.error('smoke error:', e); server.kill(); process.exit(1); });
}

main();
