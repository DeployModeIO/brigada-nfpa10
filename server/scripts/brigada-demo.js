'use strict';
// BrigadaDemo — lanzador portable SIN instalador (empaquetado con @yao-pkg/pkg).
// Doble clic: arranca API + web embebida en http://localhost:8080 y abre el navegador.
// Datos demo AISLADOS: DB propia <dir-del-exe>/brigadademo.db; NO toca data/nfpa.db.
const path = require('path');
const net = require('net');
const { spawn } = require('child_process');

const PORT = parseInt(process.env.PORT || '8080', 10);
const URL = `http://localhost:${PORT}`;
// Dentro del exe (process.pkg) la DB vive junto al binario; en dev, junto a server/.
const APP_DIR = process.pkg ? path.dirname(process.execPath) : path.join(__dirname, '..');

// Defaults ANTES de cargar src/config.js (toda variable de entorno existente tiene prioridad).
// C1 (fixes 03/10/2026): secreto de sesión ALEATORIO en runtime — no queda bakeado
// en el binario ni en el repositorio, y satisface el guard de producción de config.js.
process.env.AUTH_SECRET = process.env.AUTH_SECRET || require('crypto').randomBytes(32).toString('hex');
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.env.PORT = String(PORT);
process.env.SERVE_CLIENT = '1';
process.env.DB_PATH = process.env.DB_PATH || path.join(APP_DIR, 'brigadademo.db');
process.env.DEMO_SEED = '1';
process.env.CLIENT_DIST = process.env.CLIENT_DIST || path.join(__dirname, '..', 'dist-portable');
process.env.ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || `http://localhost:${PORT}`;

function abrirNavegador() {
  if (process.env.NO_BROWSER) return;
  const cmd = process.platform === 'win32' ? ['cmd', ['/c', 'start', '', URL]]
    : process.platform === 'darwin' ? ['open', [URL]]
      : ['xdg-open', [URL]];
  try {
    spawn(cmd[0], cmd[1], { detached: true, stdio: 'ignore' }).unref();
  } catch (_) { /* sin navegador: el usuario abre la URL a mano */ }
}

function banner(dbPath) {
  console.log('');
  console.log('============================================================');
  console.log('  BrigadaDemo — Inspeccion de extintores NFPA 10');
  console.log(`  >> Abra en el navegador:  ${URL}`);
  console.log(`  >> Datos demo (local):    ${dbPath}`);
  console.log('     (borre ese archivo para reiniciar la demo)');
  console.log('  >> Usuarios:  admin / Br1g@d4!n   inspector / 1nsp3ct0r');
  console.log('  Detener: Ctrl+C');
  console.log('============================================================');
  console.log('');
}

// Si el puerto ya está ocupado, aviso claro en vez de un stack de Node.
const probe = net.connect(PORT, '127.0.0.1');
probe.on('connect', () => {
  probe.destroy();
  console.error(`[BrigadaDemo] El puerto ${PORT} ya esta ocupado (¿otra instancia abierta?). Cierre la anterior o use PORT=otro_puerto.`);
  process.exit(1);
});
probe.on('error', () => {
  probe.destroy();
  // Puerto libre: arranca el server real (migraciones + seed demo + HTTP).
  require('../src/server.js');
  const t = setTimeout(() => { banner(process.env.DB_PATH); abrirNavegador(); clearTimeout(t); }, 1500);
  t.unref();
});
