#!/usr/bin/env bash
# TLS de producción (LAN interna/empresa) — Brigada NFPA 10.
#
# Genera un certificado AUTOFIRMADO (10 años) + llave privada para servir la API por
# HTTPS (server.js activa node:https cuando TLS_CERT y TLS_KEY están definidos).
# Pensado SOLO para redes internas de confianza (faena/empresa) donde no hay CA
# corporativa: distribuya certs/cert.pem a los dispositivos de confianza o instale la
# CA de su organización para evitar avisos. NO usar expuesto a internet público.
#
# Uso:
#   ./gen-cert.sh                 # SANs: localhost + 127.0.0.1
#   ./gen-cert.sh 192.168.1.100   # añade la IP LAN del PC como SAN (para el APK)
#
# Salida: server/certs/cert.pem y server/certs/key.pem (directorio gitignored).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p certs

IP="${1:-}"
SAN="DNS:localhost,IP:127.0.0.1"
if [ -n "$IP" ]; then
  SAN="$SAN,IP:$IP"
fi

openssl req -x509 -nodes -newkey rsa:2048 -days 3650 \
  -keyout certs/key.pem -out certs/cert.pem \
  -subj "/C=CL/O=Brigada NFPA10/CN=brigada-nfpa10-lan" \
  -addext "subjectAltName=$SAN" \
  -addext "basicConstraints=critical,CA:FALSE" \
  -addext "keyUsage=digitalSignature,keyEncipherment" \
  -addext "extendedKeyUsage=serverAuth"

chmod 600 certs/key.pem
echo "OK: certs/cert.pem + certs/key.pem (autofirmado 10 años, SANs: $SAN)"
echo "Actívelo en server/.env (o el entorno) con:"
echo "  TLS_CERT=./certs/cert.pem"
echo "  TLS_KEY=./certs/key.pem"
