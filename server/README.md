# Brigada NFPA 10 — Server

API de inspección de extintores NFPA 10 para brigadas. Node v22, Express 4, better-sqlite3 con **capa de adaptador multi-BD** (sqlite | postgres | mysql).

## Ejecución

```bash
npm install
cp .env.example .env      # opcional; defaults funcionales en dev
npm run seed              # 3 usuarios, 6 checklist, 40 extintores (idempotente)
npm run dev               # desarrollo con reinicio (--watch), PORT=3200
npm start                 # producción
npm run test:smoke        # smoke E2E con BD temporal en /tmp
```

Usuarios del seed: `admin/Br1g@d4!n`, `inspector/1nsp3ct0r`, `supervisor/sup3rv1s0r`.
Health: `GET http://localhost:3200/health` · API: prefijo `/api/v1` (contrato completo en [`docs/API.md`](docs/API.md)).

## Multi-BD (capa de adaptador)

`src/db/index.js` exporta `{query, all, get, run, exec, transaction, init}` con SQL de placeholders `?` y migraciones idempotentes (`schema_migrations`). El driver se elige por env:

| DB_DRIVER | DB_URL | Driver npm |
|---|---|---|
| `sqlite` (default) | ruta archivo, ej. `./data/nfpa.db` | better-sqlite3 (incluido) |
| `postgres` | `postgres://user:pass@host:5432/db` | `pg` (opcional, `npm install pg`) |
| `mysql` | `mysql://user:pass@host:3306/db` | `mysql2` (opcional, `npm install mysql2`) |

Los drivers no instalados fallan con mensaje claro al arrancar. `pg` y `mysql2` son `optionalDependencies`.

```bash
DB_DRIVER=postgres DB_URL=postgres://brigada:secret@db:5432/nfpa npm start
```

## Seguridad

JWT HS256 (`AUTH_SECRET`, default `dev-secret-cambiar` — **cambiar en producción**), roles `admin|inspector|supervisor` (401 sin token, 403 rol insuficiente), `helmet`, rate-limit login 20/min, CORS `ALLOW_ORIGIN` (default `http://localhost:5199`), cuerpo JSON máx 10 MB, validación/sanitización manual por ruta, errores `{error,msg}`, log con timestamp por petición.

## Webhooks a la empresa (n8n)

Configurar por API:

```bash
TOKEN=$(curl -s -X POST http://localhost:3200/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Br1g@d4!n"}' | node -e 'let d="";process.stdin.on("data",c=>d+=c).on("end",()=>console.log(JSON.parse(d).token))')

curl -s -X PATCH http://localhost:3200/api/v1/settings -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"webhookUrl":"http://127.0.0.1:5678/webhook/nfpa-alertas","webhookApi":"clave-secreta-n8n"}'
```

Eventos `POST {evento, data, ts}` con header `X-API-Key`:

- `inspeccion_con_fallas` — al registrar una inspección con alguna falla.
- `vencidos_detectados` — job cada 60 s, agrupado, solo si el conjunto de vencidos cambia.

Entrega con timeout 5 s, **fail-silent** (log en consola). Prueba manual: `POST /api/v1/alerts/webhook-test` (admin).

### Ejemplo de flujo n8n (Webhook → IF → Notificación)

1. Nodo **Webhook** (POST, path `nfpa-alertas`, respuesta 200).
2. Nodo **IF**: `{{$json.evento}}` == `vencidos_detectados` → recorrer `{{$json.data.vencidos}}` (correo/Slack a brigada); si `inspeccion_con_fallas` → `{{$json.data.tag}}` / `{{$json.data.criticas}}` a mantenimiento.
3. Validar `X-API-Key` contra la misma `webhookApi` configurada en `/settings`.

## Estructura

```
src/app.js server.js config.js
src/db/{index,sqlite,postgres,mysql,migrate}.js
src/routes/{auth,public,extintores,checklist,inspecciones,alerts,export,settings}.js
src/middleware/{auth,validate}.js
src/lib/{estado,webhook}.js
seeds/seed.js · scripts/smoke.js · docs/API.md
```

---

# Retrofit «suite-local v1» (Minería Suite — spec `brigada-cliente-local.md`)

Este repo es el **producto ancla de la línea Minería Suite** y cumple la norma
`~/proyectos/mineria-suite/PRODUCT-LINE.md` (NORMAS 1-4). Novedades del retrofit:

1. **Integración a la BD del cliente final** (`src/integration/`): modo *referencia*
   (selectores + **alta masiva** de extintores desde el inventario maestro del cliente con
   mapeo configurable) y modo *espejo* (cola local `espejo_pendencias` que espeja
   `inspecciones` y `rechazos` a tablas del cliente; un destino caído **nunca** bloquea la
   operación en terreno). Conectores reales sqlite/postgres/mysql; **stubs con 501 claro**
   para sqlserver/oracle. Test de conexión en admin sin persistir credenciales.
2. **Dominio NFPA-10**: checklist §7.2 con los 3 críticos como DATOS
   (`checklist_items.critico`: `manometro_rango`, `precinto_intacto`, `manguera_sin_fisuras`),
   motor de vencimientos (`src/lib/nfpa.js`: mensual 30 d / recarga 12 m / hidrostática
   5-12 a según agente, manda fecha de fabricación) con reglas en la tabla `nfpa_reglas`,
   **habilitaciones** de brigadistas (403 `habilitacion_vencida`; supervisor/admin exentos
   con nota de auditoría), CSV de reemplazo agrupado por área con urgencia, XLSX con
   columnas NFPA + firma de versión.
3. **Migraciones**: `003_integracion_espejo` + `004_brigada` (001/002 intactas; las rutas
   existentes se EXTIENDEN, no se reescriben). El client gana `/planta` (mapa SVG con
   pines por estado + filtros), sección admin **Base de datos del cliente** y **informe
   Bomberos PDF** (cobertura por área, morosidad, rechazos abiertos, firmas + QR —
   pdfmake local).
4. **Entrega local**: `docker/Dockerfile` + `docker/docker-compose.local.yml` (air-gap en
   runtime, volumen para la DB, healthcheck) y binario portable actualizado
   (`npm run package:demo` → `bin/BrigadaDemo-linux-x64` / `BrigadaDemo-win-x64.exe`).
5. **Tema claro por defecto** (NORMA 4) — `temaDefault=light` verificado; tokens
   semánticos, cero hex en componentes.

### Instalación en faena

```bash
# Opción A — Docker/Podman (recomendada)
cd brigada-nfpa10
AUTH_SECRET='clave-larga-única' DEMO_SEED=1 docker compose -f docker/docker-compose.local.yml up -d --build
# web+API en http://HOST:3200  (GET /health 200); datos demo solo si DB nueva + DEMO_SEED=1

# Opción B — Portable doble clic
./bin/BrigadaDemo-linux-x64        # (o .exe en Windows): abre http://localhost:8080,
                                   # DB demo aislada brigadademo.db junto al exe.
```

Usuarios demo (semilla FICTICIA): `admin/Br1g@d4!n`, `inspector/1nsp3ct0r`,
`supervisor/sup3rv1s0r`, `brigadista/Br1g@d1st4!` (habilitación vencida, para probar el 403).

ENVs de integración: ver `docs/API.md` y `.env.example`.

### Pruebas

```bash
npm test                # unit (node --test) + smoke E2E de 3 fases (39 checks, SMOKE_PORT=3200)
cd ../client && npm test && npm run build && npm run build:demo
```

## Criterios spec ↔ evidencia

| # | Criterio | Evidencia |
|---|---|---|
| 1 | Fork sin romper ancla | `base/` y forks ajenos intocados por esta sesión; el ancla EVOLUCIONA en su propio repo (commits locales) |
| 2 | Seed NFPA (críticos + reglas) | `tests/seed-data.test.js` + smoke «Criterio 2» |
| 3 | Crítico ⇒ rechazado ⇒ webhook | smoke fase MAIN (manometro_rango) |
| 4 | Hidrostática por fabricación | `tests/nfpa.test.js` (fechas inyectables) + smoke e2e PQS/CO2 |
| 5 | Habilitación vencida ⇒ 403 | smoke MAIN brigadista + supervisor exento con nota |
| 6 | /planta con pines por estado | `tests/pins.test.mjs` + verificación Playwright (capturas) |
| 7 | Búsqueda/QR offline (cache) | tests client heredados + smoke «Criterio 7» |
| 8 | Cola offline con retry | `tests/e2e/featureC-e2e.mjs` (drain total + 500→backoff) |
| 9 | CSV reemplazo agrupado/urgencia/escape | `tests/reemplazos.test.js` + smoke |
| 10 | XLSX color + firma de versión | smoke fase MAIN (re-parsea el libro) |
| 11 | PDF Bomberos (cobertura+firmas+%PDF+páginas) | `tests/bomberos.test.mjs` (render pdfmake real) |
| 12 | test-conexión + 501 stubs | smoke MAIN (sqlserver/oracle 501, postgres 502, sqlite fixture lista tablas) |
| 13 | Alta masiva desde referencia (20 equipos) | smoke fase REFERENCIA |
| 14 | Espejo con destino caído ⇒ pendiente | smoke fase ESPEJO (fila en destino + 201 sin UX roto) |
| 15 | Tema claro default + setting | smoke «Criterio 15» + tests theme client |
| 16 | Sin CDNs | smoke client «Criterio 16» src+dist; `grep https:// dist/index.html`=0 |
| 17 | Docker compose local | `docker/` + imagen construida y `/health` 200 (evidencia en PR/README) |
| 18 | Portable verificado | `bin/BrigadaDemo-linux-x64` arrancado con `/health` 200 + web servida |
| 19 | Minimización (RUT solo en users) | `tests/seed-data.test.js` grep anti-RUT en metadata/habilitaciones |
| 20 | Demo ficticio | `tests/seed-data.test.js` (usuarios/nombres del allowlist demo) |

## Deuda declarada

- **sqlserver/oracle**: siguen stubs 501 con contribución invitada (deuda de la línea,
  no de este producto).
- El seed demo no llena `ultima_recarga`/`venc_*` (el motor los soporta desde API/admin;
  los clientes reales los cargan al importar su historial).
- `/planta` proyecta lat/lng lineal (basta para una faena); mapa geoespacial real tipo
  Leaflet+tiles NO (NORMA 1 prohíbe tiles externos; sin librería local de mapas incluida).
- Users por UI sigue por seed (deuda de `base/`, PRODUCT-LINE §Deuda 3).
- Fix de conectores sqlite espejo (readonly:false + dispatch DML) aplica aquí y
  **debe subirse a `base/`** (regla de integración) — pendiente de quien parchea base.
