# Changelog

Todos los cambios relevantes de este proyecto se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y este proyecto adhiere a [Versionado Semántico](https://semver.org/lang/es/).

## [Unreleased]

### Security

Remediación de la revisión de seguridad de la rama `feat/terreno-android-import`
(hallazgos H1, M1, M2, M3, L1, L3, L4):

- **H1 (HIGH) — alcance de cleartext Android acotado.** `network_security_config.xml` pasa a
  `base-config cleartextTrafficPermitted="false"` con una plantilla `<domain-config>`
  comentada para la IP LAN del PC (TEST/PRUEBA DE CAMPO); `client/capacitor.config.ts`
  mantiene `allowMixedContent` marcado EXPLÍCITAMENTE como TEST-only (deshabilitar en
  producción con HTTPS). Nota "Seguridad (transporte)" en `client/CAPACITOR.md` y
  `docs/DEPLOY.md`: en LAN de confianza el cleartext es solo para pruebas y el Bearer token
  viaja en claro; producción = HTTPS.
- **M1 (MEDIUM) — deduplicación atómica + `captura_id` obligatorio.** Nueva migración
  `007_import_dedup` con índice UNIQUE en `inspecciones(captura_id)`; el endpoint de
  importación exige `captura_id` (400 si falta) y captura la violación de UNIQUE
  devolviendo `{ duplicado: true, captura_id }` (200) en lugar de error. El SELECT previo se
  conserva, pero el índice + catch es la guarda real contra carreras.
- **M2 (MEDIUM) — fidelidad del inspector de terreno.** `construirPayloadImport` propaga
  `inspector_username` en cada payload (del ítem si está, si no del manifest del lote);
  `ImportarTerrenoPage` pasa `lote.inspector_username`.
- **M3 (MEDIUM) — backup Android deshabilitado.** `AndroidManifest.xml` fija
  `android:allowBackup="false"` (+ `android:fullBackupContent="false"`) para impedir extraer
  el JWT del WebView (localStorage/IndexedDB) vía `adb backup`/auto-backup.
- **L1 (LOW) — límites de cordura en la importación.** La pantalla admin rechaza archivos de
  más de 50 MB (antes de parsear) y lotes de más de 5000 capturas, con error en español.
- **L3 (LOW) — CSP compatible con OSM.** helmet se configura partiendo
  `getDefaultDirectives()` y solo amplía `img-src`/`connect-src` con
  `*.tile.openstreetmap.org`; el resto de directivas no se debilita.
- **L4 (LOW) — ignorado de keystores.** `*.jks`, `*.keystore`, `*.keystore.properties` y
  `**/*.keystore` añadidos a `client/android/.gitignore` y al `.gitignore` raíz.

## [0.2.0] - 2026-10-09

### Added

- **Importación fiel de datos de terreno**: endpoint `POST /api/v1/inspections/import`
  (solo admin) e idempotente que preserva la fecha de captura (`created_at` = `creado_en`),
  el inspector original (resuelto por `username`) y el vencimiento NFPA **anclado a la fecha
  de captura**; deduplicación por `captura_id`. Migración `006_importacion`
  (`inspecciones.captura_id`, `inspecciones.origen`, tabla `importaciones`). Ver
  `docs/adr/ADR-001-terreno-android-export-import.md` y `docs/CONTRATO-EXPORT-IMPORT.md`.
- **Captura local en Android** (`VITE_MODO_CAPTURA=local`): la cola IndexedDB nunca se sube
  sola, login permanente y cada captura firmada con `captura_id` + `creado_en`.
  **Exportación manual** del lote JSON `brigada.export/v1` desde `/exportar`
  (descarga o Web Share).
- **Pantalla de importación admin** `/importar-terreno`: valida el JSON exportado y reenvía
  cada captura a `POST /inspections/import` con informe por captura (creado / duplicado /
  error) e idempotencia visible.
- **APK Android (Capacitor)**: proyecto nativo con GPS (`@capacitor/geolocation`) y cámara
  (`@capacitor/barcode-scanner`) nativos, con degradación a web (jsQR / `navigator.geolocation`).
  Guía `client/CAPACITOR.md`.
- **Mapa real de planta**: `/planta` con **Leaflet + OpenStreetMap** (teselas OSM), pines por
  estado y **deep-link a Google Maps** por extintor.
- **Profesionalización del repositorio**: licencia propietaria, este changelog, guías de
  contribución (`CONTRIBUTING.md`) y seguridad (`SECURITY.md`), código de conducta, plantilla
  de PR, ADR-001, `docs/ARCHITECTURE.md`, CI en GitHub Actions, `.editorconfig` y
  `.gitattributes`.

### Changed

- El mapa de planta deja los pines esquemáticos por el mapa real Leaflet/OSM; se conservan
  estados y comportamiento de navegación web.
- La importación de campo a la BD del PC es **manual** (store-and-forward): el PC sigue siendo
  la fuente de verdad y el vaciado nunca ocurre en línea desde el dispositivo.

### Security

- Importación restringida a rol `admin` (403 al resto); validación de `creado_en` (no futura
  > 5 min de skew, no anterior a 2000-01-01) y de claves de checklist.
- Totales de importación auditados por `meta.archivo_hash` en la tabla `importaciones`.

## [0.1.0] - 2026-10-09

### Added

- PWA offline: service worker manual y cola de inspecciones en IndexedDB con reintentos.
- Motor de dominio NFPA-10: reglas de vencimiento como datos (`nfpa_reglas`), críticos
  configurables (`manometro_rango`, `precinto_intacto`, `manguera_sin_fisuras`) y motor
  de fechas mensual / recarga / hidrostática según agente y fecha de fabricación.
- Autenticación JWT con roles `admin | inspector | supervisor` y habilitaciones de brigadistas.
- Administración: extintores, checklist configurable, settings de marca/webhooks y usuarios.
- Exportaciones: CSV de lista de reemplazo agrupada por área y urgencia, XLSX con columnas
  NFPA + firma de versión, y PDF de informe Bomberos (cobertura, morosidad, firmas + QR, pdfmake local).
- Integración con la base de datos del cliente final: modos `referencia` (alta masiva) y
  `espejo` (cola tolerante a destinos caídos), conectores sqlite/postgres/mysql y stubs 501 sqlserver/oracle.
- Capa multi-BD: driver `sqlite` por defecto; `postgres` y `mysql` opcionales.
- Mapa de planta `/planta` con pines por estado.
- Entrega local: Docker/Podman compose y binario portable (Linux/Windows).
- Webhooks a la empresa (n8n): inspecciones con fallas y vencidos detectados.
- Tema claro por defecto con tokens semánticos.
