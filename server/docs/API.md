# API Brigada NFPA 10 — Swagger-lite

Base URL: `http://<host>:3200/api/v1` · JSON · Auth: header `Authorization: Bearer <token>` (JWT HS256, secreto `AUTH_SECRET`).
Roles: `admin` | `inspector` | `supervisor`. Errores: `{ "error": "<codigo>", "msg": "<descripción>" }` con 400/401/403/404/409/413/429/500/502.

## Autenticación

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/auth/login` | No | `{username,password}` → `{token, user:{id,username,nombre,rol}}`. Rate-limit 20/min. 401 credenciales inválidas. |

## Configuración pública

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/public-config` | **No** | `{appName, logoDataUrl, brand:{primary,ok,warn,err,info}, temaDefault}` |

## Extintores

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/extinguishers?page&size&q&estado` | Sí | `{items,total,page,size}`. `q` busca en tag/ubicacion/tipo. `estado` ∈ `vigente\|por_vencer\|vencido\|rechazado\|sin_inspeccionar` (estadoCalculado). |
| GET | `/extinguishers/:tag` | Sí | Un extintor + `estadoCalculado`. 404 si no existe/activo. |
| POST | `/extinguishers` | admin | Crear. Requiere `tag` (alfanumérico 2-32) y `ubicacion`. 409 si tag existe. |
| PATCH | `/extinguishers/:tag` | Sí | Actualizar campos parciales (tag no se renombra). |
| DELETE | `/extinguishers/:tag` | admin | Soft delete (`activo=false`). |

Campos del extintor: `tag, ubicacion, tipo, capacidad_l, presion_bar, fecha_fabricacion, ultima_inspeccion, proximo_vencimiento, estado_inspeccion (pasa|falla|n_a), rechazado (bool), notas, lat, lng, activo, estadoCalculado`.

`estadoCalculado`: `rechazado` si rechazado=1; `sin_inspeccionar` si faltan fechas de inspección; `vencido` si `proximo_vencimiento < ahora`; `por_vencer` si vence en ≤7 días; `vigente` en caso contrario.

## Checklist configurable

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/checklist-items` | Sí | Ítems `activo=1` ordenados por `orden`. |
| POST | `/checklist-items` | admin | `{clave, etiqueta, orden?, activo?}`. |
| PATCH | `/checklist-items/:id` | admin | Parcial. |
| DELETE | `/checklist-items/:id` | admin | Físico. |

SEED: `presion_rango, precinto_intacto, manguera_sin_fisuras, senaletica_visible, acceso_despejado, soporte_firme`.
Claves críticas (producen rechazo): `presion_rango, precinto_intacto, manguera_sin_fisuras`.

## Inspecciones

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| POST | `/inspections` | inspector+ (todos los roles) | `{tag, resultados:{clave:bool}, observaciones?, foto_evidencia_base64?, gps:{lat,lng}?, dispositivo?}`. Claves ausentes = falla. Actualiza extintor: `ultima_inspeccion=now`, `proximo_vencimiento=+30d`, `estado_inspeccion`, `rechazado` si falla ≥1 crítica. Guarda foto (base64, máx ~4 MB chars) y geo. Si hay fallas → webhook `inspeccion_con_fallas` (fail-silent). 201 con resumen. |
| GET | `/inspections?tag&desde&hasta&page&size` | Sí | Paginado; no incluye `foto` (flag `tiene_foto`). |
| GET | `/inspections/:id` | Sí | Inspección completa con `foto_evidencia_base64` (columna `foto`). |

## Alertas y exportación

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/alerts/panel` | Sí | Semáforo: `{verde:[vigente], amarillo:[por_vencer], rojo:[vencido], negro:[rechazado], cont:{v,g,r,n}}`. `sin_inspeccionar` no entra al semáforo. |
| GET | `/alerts/replacement-list.csv` | Sí | CSV `attachment` de vencidos + rechazados. |
| POST | `/alerts/webhook-test` | admin | Prueba manual del webhook. 400 si no configurado, 502 si falla la entrega. |
| GET | `/export/extinguishers.xlsx` | Sí | ExcelJS: hoja "Extintores" con todos los campos + estadoCalculado coloreado. |

## Settings (marca y webhooks)

| Método | Ruta | Auth | Descripción |
|---|---|---|---|
| GET | `/settings` | admin | Estado completo (incluye `webhookUrl/webhookApi`). |
| PATCH | `/settings` | admin | `{appName?, logoDataUrl?, brand?:{primary,ok,warn,err,info}, temaDefault?(dark|light), webhookUrl?, webhookApi?}`. `webhookUrl` valida `http(s)://`; colores hex. |

## Webhooks a la empresa (n8n)

Job cada `WEBHOOK_INTERVAL_MS` (60 s): agrupa extintores `vencido` y POST `{evento:"vencidos_detectados", data:{total, vencidos:[...]}, ts}` solo si el conjunto cambia (hash en settings). Inspección con fallas → `{evento:"inspeccion_con_fallas", data:{tag,ubicacion,inspector,fallas,criticas,rechazado,inspeccion_id}, ts}`. Header `X-API-Key: <settings.webhookApi>`, timeout 5 s, fail-silent con log en consola.

## Infra

- `GET /health` (fuera de `/api/v1`): estado del proceso.
- helmet, CORS `ALLOW_ORIGIN` (default `http://localhost:5199`), cuerpo JSON máx `10mb` (413 si excede), log por petición con timestamp.
- 404 y 500 global handlers con formato `{error,msg}`.

## Ejemplo de login

```bash
curl -s -X POST http://localhost:3200/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"Br1g@d4!n"}'
```
