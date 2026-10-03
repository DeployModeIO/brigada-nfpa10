'use strict';
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const path = require('path');
const config = require('./config');

const authRoutes = require('./routes/auth');
const publicRoutes = require('./routes/public');
const extintoresRoutes = require('./routes/extintores');
const checklistRoutes = require('./routes/checklist');
const inspeccionesRoutes = require('./routes/inspecciones');
const alerts = require('./routes/alerts');
const exportRoutes = require('./routes/export');
const settings = require('./routes/settings');

function ts() { return new Date().toISOString(); }

function buildApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('json spaces', 0);

  app.use(helmet());
  app.use(cors({
    origin(origin, cb) {
      // Sin header Origin (curl, apps nativas, n8n) se permite.
      if (!origin || config.allowOrigin.includes(origin)) return cb(null, true);
      return cb(null, false);
    }
  }));
  app.use(express.json({ limit: config.jsonLimit }));

  app.use((req, res, next) => {
    const t0 = Date.now();
    res.on('finish', () => {
      console.log(`[${ts()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${Date.now() - t0}ms)${req.user ? ' user=' + req.user.username : ''}`);
    });
    next();
  });

  app.get('/health', (req, res) => res.json({ ok: true, uptime: process.uptime(), db: config.dbDriver }));

  const api = express.Router();
  api.use(authRoutes);
  api.use(publicRoutes);
  api.use(extintoresRoutes);
  api.use(checklistRoutes);
  api.use(inspeccionesRoutes);
  api.use(alerts.router);
  api.use(exportRoutes);
  api.use(settings.router);
  app.use('/api/v1', api);

  // Modo serve-client (binario portable): la web embebida se sirve desde el propio server.
  // Fallback SPA: GET que no sea /api* cae en index.html para rutas del router del cliente.
  if (config.serveClient) {
    app.use(express.static(config.clientDist, { index: 'index.html', maxAge: '1h' }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) return next();
      res.sendFile(path.join(config.clientDist, 'index.html'), (err) => {
        if (err && !res.headersSent) res.status(503).json({ error: 'client_missing', msg: 'No se encontró index.html del cliente' });
      });
    });
  }

  app.use((req, res) => res.status(404).json({ error: 'not_found', msg: `Ruta inexistente: ${req.method} ${req.path}` }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(`[${ts()}] [error] ${req.method} ${req.originalUrl}:`, err.message);
    if (res.headersSent) return;
    const status = err.statusCode || (err.type === 'entity.too.large' ? 413 : 500);
    res.status(status).json({
      error: status === 413 ? 'payload_too_large' : 'internal',
      msg: status === 413 ? 'Cuerpo JSON excede el límite' : 'Error interno del servidor'
    });
  });

  return app;
}

module.exports = { buildApp };
