'use strict';
// Sanitización y validación manual (sin librerías externas de validación).
const bad = (res, msg) => res.status(400).json({ error: 'bad_request', msg });

function cleanStr(v, max = 255) {
  if (v === null || v === undefined) return null;
  const s = String(v).replace(/[\u0000-\u001F\u007F]/g, '').trim();
  return s.length ? s.slice(0, max) : null;
}

// 1/0 para columnas booleanas; null si el valor no es booleanizable.
function toInt01(v) {
  if (v === true || v === 1 || v === '1' || v === 'true') return 1;
  if (v === false || v === 0 || v === '0' || v === 'false' || v === null || v === undefined) return 0;
  return null;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined; // undefined = inválido
}

// null = vacío permitido; undefined = formato inválido; string ISO/fecha validado.
function validDate(v) {
  if (v === null || v === undefined || v === '') return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(s)) return undefined;
  return Number.isNaN(Date.parse(s)) ? undefined : s;
}

const TAG_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{1,31}$/;
const COLOR_RE = /^#[0-9a-fA-F]{3,8}$/;
const URL_RE = /^https?:\/\/\S+$/i;
const B64_RE = /^[A-Za-z0-9+/]*={0,2}$/;
const ESTADOS_INSP = ['pasa', 'falla', 'n_a'];
const ROLES = ['admin', 'inspector', 'supervisor'];

function paginate(q) {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const size = Math.min(200, Math.max(1, parseInt(q.size, 10) || 20));
  return { page, size, offset: (page - 1) * size };
}

// Búsqueda LIKE segura: se eliminan comodines del input del usuario.
function searchLike(q) {
  const s = cleanStr(q, 64);
  if (!s) return null;
  return '%' + s.replace(/[%_\\]/g, ' ').trim() + '%';
}

module.exports = { bad, cleanStr, toInt01, toNum, validDate, TAG_RE, COLOR_RE, URL_RE, B64_RE, ESTADOS_INSP, ROLES, paginate, searchLike };
