'use strict';
const fs = require('fs');
const config = require('./config');
const db = require('./db');
const { migrate } = require('./db/migrate');
const { buildApp } = require('./app');
const { startWebhookJob } = require('./lib/webhook');
const { startEspejoJob } = require('./integration/espejo');

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

  const server = app.listen(config.port, () => {
    console.log(`[${new Date().toISOString()}] API Brigada NFPA 10 escuchando en http://0.0.0.0:${config.port} (DB_DRIVER=${config.dbDriver}, rutas /api/v1)`);
  });

  const shutdown = (sig) => {
    console.log(`[${new Date().toISOString()}] ${sig}: cerrando servidor`);
    server.close(() => db.close().finally(() => process.exit(0)));
    setTimeout(() => process.exit(0), 3000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
})();
