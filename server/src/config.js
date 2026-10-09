'use strict';
const fs = require('fs');
const path = require('path');

(function loadDotEnv() {
  try {
    const p = path.join(__dirname, '..', '.env');
    if (!fs.existsSync(p)) return;
    for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (m && process.env[m[1]] === undefined) {
        let v = m[2];
        if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
        process.env[m[1]] = v;
      }
    }
  } catch (_) { /* .env opcional */ }
})();

const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3200', 10),
  dbDriver: (process.env.DB_DRIVER || 'sqlite').toLowerCase(),
  // DB_PATH: ruta directa (modo portable/demo); DB_URL: convención histórica.
  dbUrl: path.resolve(__dirname, '..', process.env.DB_PATH || process.env.DB_URL || './data/nfpa.db'),
  serveClient: process.env.SERVE_CLIENT === '1',
  clientDist: path.resolve(__dirname, '..', process.env.CLIENT_DIST || '../client/dist'),
  demoSeed: process.env.DEMO_SEED === '1',
  authSecret: process.env.AUTH_SECRET || 'dev-secret-cambiar',
  tokenTtl: process.env.TOKEN_TTL || '12h',
  allowOrigin: (process.env.ALLOW_ORIGIN || 'http://localhost:5199')
    .split(',').map((s) => s.trim()).filter(Boolean),
  jsonLimit: process.env.JSON_LIMIT || '10mb',
  webhookIntervalMs: parseInt(process.env.WEBHOOK_INTERVAL_MS || '60000', 10),
  // --- Integración a la base de datos del CLIENTE FINAL (PRODUCT-LINE.md §NORMA 3) ---
  // off        : sin integración (default; almacén propio sqlite)
  // referencia : lectura/alta-masiva desde tablas maestras del cliente (selectores + importar)
  // espejo     : escritura de inspecciones/rechazos a tablas del cliente (mapeo configurable)
  integrationMode: (process.env.INTEGRATION_MODE || 'off').toLowerCase(),
  clientDbDriver: (process.env.CLIENT_DB_DRIVER || 'postgres').toLowerCase(),
  clientDbUrl: process.env.CLIENT_DB_URL || '',
  // JSON de listas maestras del cliente: {"equipos":{"table":"...","id":"...","label":"...","where":"..."}}
  integrationRefLists: process.env.INTEGRATION_REF_LISTS || '{}',
  // JSON columna-cliente -> columna-extintor para POST /integration/ref/:lista/importar
  integrationImportMap: process.env.INTEGRATION_IMPORT_MAP || '{}',
  espejoIntervalMs: parseInt(process.env.ESPEJO_INTERVAL_MS || '30000', 10)
};

// ─── TLS opcional para producción (HTTPS en LAN interna/empresa) ───────────────
// Si TLS_CERT y TLS_KEY están AMBOS definidos, server.js sirve por node:https en el
// mismo puerto. Aceptan rutas a ficheros PEM (relativas a server/, como DB_URL) o el
// PEM inline. Par autofirmado de referencia: server/scripts/gen-cert.sh (SOLO LAN interna).
function leerPem(valor) {
  if (!valor) return '';
  try {
    const ruta = path.resolve(__dirname, '..', valor);
    if (fs.existsSync(ruta)) return fs.readFileSync(ruta, 'utf8');
  } catch (_) { /* cae a usar el valor tal cual (PEM inline) */ }
  return valor;
}
config.tlsCert = leerPem(process.env.TLS_CERT || '');
config.tlsKey = leerPem(process.env.TLS_KEY || '');


// ─── C1 (fixes seguridad 03/10/2026) ───────────────────────────────────────────
// En producción está PROHIBIDO el secreto del repositorio: AUTH_SECRET debe venir
// del entorno (docker run / compose) con un valor aleatorio, nunca bakeado.
const SECRETOS_PROHIBIDOS = ['dev-secret-cambiar', 'REVISAR-ANTES-DE-PRESENTACION'];
if (config.env === 'production') {
  const s = (process.env.AUTH_SECRET || '').trim();
  if (!s || SECRETOS_PROHIBIDOS.includes(s)) {
    throw new Error("[config] NODE_ENV=production exige AUTH_SECRET aleatorio, distinto del default del repositorio. Genere uno con: openssl rand -hex 32 y paselo por docker run o compose.");
  }
}

module.exports = config;
