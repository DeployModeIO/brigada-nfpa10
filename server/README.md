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
