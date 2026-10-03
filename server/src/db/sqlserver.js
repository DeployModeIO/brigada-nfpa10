'use strict';
// STUB: conector SQL Server pendiente. Muchos clientes mineros usan MSSQL/Oracle:
// ver PRODUCT-LINE.md "deuda conocida". Para implementar: misma API del adaptador
// (init/close/all/get/run/query/exec/transaction) sobre el paquete `mssql` (tedious),
// con placeholders "?" ya que db/index.js normaliza por dialecto.
const MSG = 'DB_DRIVER=sqlserver: conector pendiente de implementación (contribuya: server/src/db/sqlserver.js) — ver PRODUCT-LINE.md §Deuda conocida';

async function init() { throw new Error(MSG); }

module.exports = {
  dialect: 'sqlserver',
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
