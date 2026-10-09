# Brigada NFPA-10

Sistema de inspección de extintores **NFPA 10** para brigadas: cliente web offline-first,
API Node/Express con capa multi-BD y app Android de terreno con captura local y
transferencia manual al PC. La **base de datos del PC es la fuente de verdad**.

| Superficie | Carpeta | Descripción |
|---|---|---|
| Cliente web (PWA) | `client/` | React 18 + Vite + TypeScript + Tailwind 4. Inspección, administración, mapa de planta, exportaciones. |
| Servidor API `/api/v1` | `server/` | Node/Express, JWT por roles, dominio NFPA-10, multi-BD (sqlite/postgres/mysql), webhooks y exportaciones. |
| APK Android (terreno) | `client/android` + `client/capacitor.config.ts` | WebView Capacitor con GPS/cámara nativos; captura **local** y export JSON manual al PC. |

## Arranque rápido (PC)

```bash
# Servidor (API + web servida por el portable en producción)
cd server && npm install && npm run seed && npm run dev     # http://localhost:3200

# Cliente web en desarrollo
cd client && npm install && npm run dev                     # http://localhost:5199
```

Usuarios del seed (solo entorno de demo/dev): `admin/Br1g@d4!n`, `inspector/1nsp3ct0r`,
`supervisor/sup3rv1s0r`, `brigadista/Br1g@d1st4!` (este último con habilitación vencida, para
probar el rechazo).

Documentación de referencia: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md),
[server/README.md](server/README.md), [CONTRIBUTING.md](CONTRIBUTING.md),
[SECURITY.md](SECURITY.md), [CHANGELOG.md](CHANGELOG.md).

## Modo terreno (Android + PC)

Flujo **store-and-forward** para inspeccionar sin cobertura y volcar después al PC:

1. **APK de captura local (Capacitor).** La app corre la web en un WebView con GPS y cámara
   nativos. Con `VITE_MODO_CAPTURA=local` la cola IndexedDB **nunca** se sube sola, el
   **login es permanente** y cada captura queda firmada con `captura_id` + `creado_en`.
   Ver [client/CAPACITOR.md](client/CAPACITOR.md).
2. **Exportación manual.** En `/exportar` el brigadista genera un fichero JSON
   `brigada.export/v1` (o lo comparte por Web Share) con las capturas pendientes.
3. **Pantalla de importación admin en el PC.** En `/importar-terreno` (solo `admin`) se
   selecciona el JSON, se valida y cada captura se reenvía a `POST /api/v1/inspections/import`.
4. **Importación fiel e idempotente.** Se preserva la **fecha de captura** (`created_at` =
   `creado_en`), el **inspector original** (resuelto por `username`) y el **vencimiento NFPA
   anclado a la captura** (no al reloj del PC). El **dedupe por `captura_id`** evita duplicados
   al reimportar el mismo lote. Contrato en
   [docs/CONTRATO-EXPORT-IMPORT.md](docs/CONTRATO-EXPORT-IMPORT.md).
5. **Mapa real de planta.** `/planta` usa **Leaflet + OpenStreetMap** (teselas OSM) con pines
   por estado y **deep-link a Google Maps** para navegar a cada extintor.

**Build del APK** — requiere JDK 17/21 + Android SDK (ver requisitos y pasos completos en
[client/CAPACITOR.md](client/CAPACITOR.md) y el runbook [docs/DEPLOY.md](docs/DEPLOY.md)):

```bash
cd client
VITE_MODO_CAPTURA=local VITE_API_URL=http://<IP-PC>:8080/api/v1 npm run build \
  && npx cap sync android \
  && cd android && ./gradlew assembleRelease
```

## Tests

```bash
cd server && npm run test:unit           # node --test (unidad)
cd server && SMOKE_PORT=3299 npm run test:smoke   # smoke E2E (usar un puerto libre)
cd client && npm test && npm run build && npm run build:demo
```

## Licencia

Propietaria / todos los derechos reservados — ver [LICENSE](LICENSE).
