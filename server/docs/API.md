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

## Integración a la BD del cliente (retrofit suite-local v1 — NORMA 3)

Configuración SOLO por ENV del server (`INTEGRATION_MODE=off|referencia|espejo`,
`CLIENT_DB_DRIVER`, `CLIENT_DB_URL`, `INTEGRATION_REF_LISTS`, `INTEGRATION_IMPORT_MAP`).

| Método | Ruta | Rol | Descripción |
|---|---|---|---|
| GET | `/integration/status` | admin | modo, driver propio, DB cliente (URL enmascarada), listas referencia, mapeos/pendientes espejo |
| POST | `/integration/test` | admin | prueba credenciales UNA vez y lista tablas; NO persiste nada. `sqlserver`/`oracle` → 501 `connector_pending` |
| GET | `/integration/ref` | auth | listas definidas en modo referencia |
| GET | `/integration/ref/:nombre` | auth | filas `{id,label}` de la tabla maestra del cliente (cache TTL 5 min) |
| POST | `/integration/ref/:nombre/importar` | admin | alta masiva de extintores desde la maestra del cliente con mapeo `INTEGRATION_IMPORT_MAP`; columnas no mapeadas viajan a `metadata` (origen «referencia»). Respuesta: `{leidas,creados,actualizados,saltados,errores}` |
| GET/PUT | `/integration/espejo/mapeos` | admin | JSON de mapeos origen→tabla destino (`inspecciones`, `rechazos`) |
| POST | `/integration/espejo/flush` | admin | fuerza el envío de la cola espejo (pendientes con backoff 15 s→30 min) |

## Habilitaciones de brigadistas (spec §Reglas 3)

`habilitaciones(brigadista_user_id, tipo_equipo ('*'=todos o agente), vigente_hasta, certificado)`.
- POST /inspections como rol `inspector` sin habilitación vigente → **403 `habilitacion_vencida`**.
- `supervisor`/`admin` pueden firmar sin habilitación; queda `habilitacion='exenta_supervisor|exenta_admin'` en la fila (nota de auditoría).
- Lista configurable vía setting `habilitacionRoles` (default `inspector`).

## Vencimientos NFPA (motor `src/lib/nfpa.js`)

- Reglas como DATOS en `nfpa_reglas` (mensual 30 d; recarga 12 m; hidrostática 12 a PQS-acero / 5 a CO2·agua·BC·K; manda la fecha de fabricación del cilindro).
- `estadoCalculado` = min(inspección, recarga, hidrostática); amarillo: inspección ≤7 d, recarga/hidrostática ≤30 d.
- `GET /extinguishers` añade `venceEn`, `motivoVencimiento` y filtros `?area=&agente=` (para `/planta`).
- POST /inspections revalida `proximo_vencimiento` con el motor (ya no es solo +30 d fijos).

## Nuevas respuestas/extensiones (retrofit)

- `POST /inspections` responde además `habilitacion`; guarda `motivo_rechazo`.
- `GET /checklist-items` incluye `critico` (1 = su falla rechaza; crítico es DATO configurable, spec §Reglas 1).
- `GET /alerts/replacement-list.csv`: `area,tag,ubicacion,tipo,capacidad_l,proximo_vencimiento,motivo,dias_mora` — agrupado por área y ordenado por urgencia (rechazado > vencido con más mora).
- `GET /export/extinguishers.xlsx`: columnas Agente/Venc. recarga/Venc. hidrostática + estado coloreado + fila de firma de versión `brigada-nfpa10/xlsx-v1.1`.
- `PATCH /settings` acepta `jefeBrigada` (firma del informe Bomberos del client).
