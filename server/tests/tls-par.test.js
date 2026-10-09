'use strict';
// Prevalidación del par PEM de TLS (server/src/lib/tls.js): helper PURO que evita el
// crash-loop de server.js con TLS_CERT/TLS_KEY inválidos. Los pares válidos se generan
// con openssl si está disponible (si no, esos casos se saltan; los inválidos no lo necesitan).
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { validarParPem } = require('../src/lib/tls.js');

const TIENE_OPENSSL = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();

// Genera un par self-signed en un directorio temporal; devuelve { cert, key } en PEM.
function generarPar(dir, nombre) {
  const keyPem = path.join(dir, `${nombre}.key.pem`);
  const certPem = path.join(dir, `${nombre}.cert.pem`);
  execFileSync('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
    '-keyout', keyPem, '-out', certPem,
    '-days', '2', '-subj', '/CN=brigada-test',
  ], { stdio: 'ignore' });
  return { cert: fs.readFileSync(certPem, 'utf8'), key: fs.readFileSync(keyPem, 'utf8') };
}

test('validarParPem: PEM ilegibles ⇒ !ok con mensaje claro', () => {
  const r = validarParPem('no-es-un-certificado', 'no-es-una-clave');
  assert.equal(r.ok, false);
  assert.match(r.error, /TLS_CERT\/TLS_KEY inválidos/);
});

test('validarParPem: clave ilegible con cert válido ⇒ !ok', { skip: !TIENE_OPENSSL && 'openssl no disponible' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brigada-tls-par-'));
  try {
    const { cert } = generarPar(tmp, 'a');
    const r = validarParPem(cert, '-----BEGIN PRIVATE KEY-----\nNO\n-----END PRIVATE KEY-----\n');
    assert.equal(r.ok, false);
    assert.match(r.error, /TLS_CERT\/TLS_KEY inválidos/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('validarParPem: cert y clave de PARES DISTINTOS ⇒ !ok (no forman pareja)', { skip: !TIENE_OPENSSL && 'openssl no disponible' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brigada-tls-par-'));
  try {
    const parA = generarPar(tmp, 'a');
    const parB = generarPar(tmp, 'b');
    const r = validarParPem(parA.cert, parB.key);
    assert.equal(r.ok, false);
    assert.match(r.error, /no forman una pareja/);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('validarParPem: pareja válida (self-signed real) ⇒ ok', { skip: !TIENE_OPENSSL && 'openssl no disponible' }, () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brigada-tls-par-'));
  try {
    const par = generarPar(tmp, 'ok');
    assert.deepEqual(validarParPem(par.cert, par.key), { ok: true });
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
