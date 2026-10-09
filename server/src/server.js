'use strict';
const fs = require('fs');
const https = require('https');
const config = require('./config');
const db = require('./db');
const { migrate } = require('./db/migrate');
const { buildApp } = require('./app');
const { startWebhookJob } = require('./lib/webhook');
const { startEspejoJob } = require('./integration/espejo');
const { validarParPem } = require('./lib/tls');

(async () => {
  try {
    const freshDb = config.dbDriver === 'sqlite' && !fs.existsSync(config.dbUrl);
    await migrate();
    // Modo demo/portable: DB recién creada + DEMO_SEED=1 → seed automático (40 extintores, usuarios).
    if (config.demoSeed && freshDb) {
      const { runSeed } = require('../seeds/seed');
      console.log(`[${new Date().toISOString()}] [seed] DB nueva en ${config.dbUrl}: poblando datos demo`);
      await runSeed();
    } else if (config.demoSeed) {
      console.log(`[${new Date().toISOString()}] [seed] DEMO_SEED=1 pero la DB ya existe: conservando datos`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [db] migración falló: ${e.message}`);
    process.exit(1);
  }

  const app = buildApp();
  startWebhookJob(config.webhookIntervalMs);
  startEspejoJob();

  // TLS de producción (opcional): con TLS_CERT y TLS_KEY definidos se sirve por HTTPS en
  // el mismo puerto (uso pensado: LAN interna/empresa con el par de gen-cert.sh).
  let server;
  if (config.tlsCert && config.tlsKey) {
    // Prevalidación del par PEM: error claro + salida 1 en vez de crash-loop críptico.
    const par = validarParPem(config.tlsCert, config.tlsKey);
    if (!par.ok) {
      console.error(`[${new Date().toISOString()}] [tls] ${par.error}`);
      console.error(`[${new Date().toISOString()}] [tls] Revise TLS_CERT/TLS_KEY (par de scripts/gen-cert.sh) y arranque de nuevo.`);
      process.exit(1);
    }
    server = https.createServer({ cert: config.tlsCert, key: config.tlsKey }, app);
    // Un PEM que pasa la prevalidación pero Node rechaza al usarlo tampoco debe crash-loop.
    server.on('error', (err) => {
      console.error(`[${new Date().toISOString()}] [tls] Error del servidor HTTPS (¿TLS_CERT/TLS_KEY inválidos?): ${err.message}`);
      process.exit(1);
    });
    server.listen(config.port, () => {
      console.log(`[${new Date().toISOString()}] API Brigada NFPA 10 escuchando en https://0.0.0.0:${config.port} (HTTPS, DB_DRIVER=${config.dbDriver}, rutas /api/v1)`);
    });
  } else {
    server = app.listen(config.port, () => {
      console.log(`[${new Date().toISOString()}] API Brigada NFPA 10 escuchando en http://0.0.0.0:${config.port} (DB_DRIVER=${config.dbDriver}, rutas /api/v1)`);
    });
  }

  const shutdown = (sig) => {
    console.log(`[${new Date().toISOString()}] ${sig}: cerrando servidor`);
    server.close(() => db.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();
