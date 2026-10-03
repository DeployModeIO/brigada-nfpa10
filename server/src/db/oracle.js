'use strict';
// STUB: conector Oracle pendiente (ver PRODUCT-LINE.md §Deuda conocida).
// Implementar sobre `oracledb`; notar binds :1..:n y posible necesidad de Thick client.
const MSG = 'DB_DRIVER=oracle: conector pendiente de implementación (contribuya: server/src/db/oracle.js) — ver PRODUCT-LINE.md §Deuda conocida';

async function init() { throw new Error(MSG); }

module.exports = {
  dialect: 'oracle',
  stub: true,
  init,
  close: async () => { throw new Error(MSG); },
  all: async () => { throw new Error(MSG); },
  get: async () => { throw new Error(MSG); },
  run: async () => { throw new Error(MSG); },
  query: async () => { throw new Error(MSG); },
  exec: async () => { throw new Error(MSG); },
  transaction: async () => { throw new Error(MSG); }
};
