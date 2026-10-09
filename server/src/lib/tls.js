'use strict';
// Prevalidación del par PEM de TLS (fix LOW): fallar RÁPIDO con un mensaje claro en
// español en vez de crash-loop dentro de https.createServer con un error críptico
// (bad decrypt, EBYTES, clave cifrada con passphrase sin proporcionar, etc.).
const crypto = require('crypto');

/**
 * Valida el par certificado+clave ANTES de crear el servidor HTTPS.
 * Comprueba que ambos PEM se puedan interpretar y que la clave privada corresponde
 * al certificado (comparación de clave pública SPKI).
 * Devuelve { ok:true } o { ok:false, error } con mensaje listo para el log.
 */
function validarParPem(certPem, keyPem) {
  try {
    const cert = new crypto.X509Certificate(certPem);
    const pubClave = crypto.createPublicKey(crypto.createPrivateKey(keyPem)).export({ type: 'spki', format: 'pem' });
    const pubCert = cert.publicKey.export({ type: 'spki', format: 'pem' });
    if (pubClave !== pubCert) {
      return {
        ok: false,
        error: 'TLS_CERT/TLS_KEY inválidos: el certificado y la clave privada no forman una pareja',
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: false,
      error: `TLS_CERT/TLS_KEY inválidos: no se pudieron interpretar los PEM (${e.message})`,
    };
  }
}

module.exports = { validarParPem };
