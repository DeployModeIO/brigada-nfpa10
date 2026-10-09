'use strict';
// TLS opcional de producción (HTTPS en LAN interna): config lee TLS_CERT/TLS_KEY —
// rutas a PEM (relativas a server/, como DB_URL) o PEM inline — y por defecto quedan
// vacías para que server.js siga en HTTP. Estilo del guard C1: spawn de node para no
// heredar el config ya cacheado de este proceso.
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function runConfig(env) {
  return execFileSync('node', ['-e',
    'const c = require("./src/config.js"); console.log(JSON.stringify({ tlsCert: c.tlsCert, tlsKey: c.tlsKey }));'
  ], { cwd: ROOT, env: { ...process.env, ...env }, encoding: 'utf8' });
}

test('TLS: por defecto vacío ⇒ server.js queda en HTTP', () => {
  const out = JSON.parse(runConfig({ TLS_CERT: '', TLS_KEY: '' }));
  assert.equal(out.tlsCert, '');
  assert.equal(out.tlsKey, '');
});

test('TLS: lee los PEM desde rutas a ficheros', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'brigada-tls-'));
  try {
    const cert = '-----BEGIN CERTIFICATE-----\nTESTCERT\n-----END CERTIFICATE-----\n';
    const key = '-----BEGIN PRIVATE KEY-----\nTESTKEY\n-----END PRIVATE KEY-----\n';
    const rutaCert = path.join(tmp, 'cert.pem');
    const rutaKey = path.join(tmp, 'key.pem');
    fs.writeFileSync(rutaCert, cert);
    fs.writeFileSync(rutaKey, key);
    const out = JSON.parse(runConfig({ TLS_CERT: rutaCert, TLS_KEY: rutaKey }));
    assert.equal(out.tlsCert, cert);
    assert.equal(out.tlsKey, key);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('TLS: un valor sin fichero se pasa tal cual (PEM inline)', () => {
  const pem = '-----BEGIN CERTIFICATE-----\nINLINE\n-----END CERTIFICATE-----\n';
  const out = JSON.parse(runConfig({ TLS_CERT: pem, TLS_KEY: '' }));
  assert.equal(out.tlsCert, pem);
});
