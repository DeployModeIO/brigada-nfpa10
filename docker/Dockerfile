# Brigada NFPA-10 — imagen LOCAL (NORMA 1: build requiere red solo para npm ci;
# el runtime funciona air-gap: API+web embebidas, SQLite en volumen, cero CDN).
# Build (contexto = raíz del producto):
#   docker build -f docker/Dockerfile -t brigada-nfpa10:local .
#   (podman build funciona igual)
FROM node:22-bookworm-slim AS clientbuild
WORKDIR /app/client
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

FROM node:22-bookworm-slim AS serverbuild
WORKDIR /app/server
COPY server/package.json server/package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund

FROM node:22-bookworm-slim AS runtime
ENV NODE_ENV=production \
    PORT=3200 \
    SERVE_CLIENT=1 \
    DB_DRIVER=sqlite \
    DB_PATH=/data/brigada.db \
    CLIENT_DIST=/app/client/dist \
    AUTH_SECRET=REVISAR-ANTES-DE-PRESENTACION
WORKDIR /app
COPY server/ ./
COPY --from=serverbuild /app/server/node_modules ./node_modules
COPY --from=clientbuild /app/client/dist ./client/dist
# seed demo FICTICIO opcional en DB nueva: DEMO_SEED=1 (criterio 20)
RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 3200
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3200)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "src/server.js"]
