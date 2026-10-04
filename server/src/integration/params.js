'use strict';
// Helper común de placeholders según el driver del DB del CLIENTE (PRODUCT-LINE.md
// §Requisito 3). Factorizado de espejo.js (donde vivía como `interpola`) para que
// referencia.js y espejo.js compartan la misma convención: sqlite/mysql usan `?`;
// postgres usa `$1..$n`. La interpolación es textual pero SOLO sobre `?` generados
// por nosotros: los identificadores SQL pasan por IDENT_RE antes de construir.
function interpola(sql, dialect) {
  // Postgres usa $1..$n en lugar de ?.
  if (String(dialect || '').toLowerCase() !== 'postgres') return sql;
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

module.exports = { interpola };
