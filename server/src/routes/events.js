'use strict';
// GET /api/v1/events?token=<jwt> — canal SSE en tiempo real (V2.1 O&G).
const express = require('express');
const { streamSSE } = require('../lib/eventos');

const router = express.Router();

router.get('/events', (req, res, next) => {
  streamSSE(req, res).catch(next);
});

module.exports = router;
