'use strict';
const express = require('express');
const { loadSettings } = require('./settings');

const router = express.Router();

// SIN auth: configuración de marca para el frontend.
router.get('/public-config', async (req, res, next) => {
  try {
    const s = await loadSettings();
    res.json({
      appName: s.appName,
      jefeBrigada: s.jefeBrigada,
      logoDataUrl: s.logoDataUrl,
      brand: s.brand,
      temaDefault: s.temaDefault,
      configTipos: s.configTipos,
      configUbicaciones: s.configUbicaciones
    });
  } catch (e) { next(e); }
});

module.exports = router;
