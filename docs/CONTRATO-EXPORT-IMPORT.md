# Contrato export / import de terreno

Contrato entre el **APK de campo** (exporta) y el **servidor del PC** (importa). Es el
interfaz estable del flujo store-and-forward; cualquier cambio aquí es un cambio de esquema.

- Generador: `client/src/features/terreno/exportarLote.ts` (`construirExport`).
- Consumidor PC: `client/src/features/admin/importarTerreno.ts` + `ImportarTerrenoPage.tsx`.
- Endpoint: `server/src/routes/inspecciones.js` → `POST /api/v1/inspections/import`.

---

## 1. Fichero de export (`brigada.export/v1`)

Fichero JSON con nombre `brigada-terreno-YYYYMMDD-HHmm.json`. Objeto raíz (manifest) + items:

```json
{
  "schema": "brigada.export/v1",
  "generado_en": "2026-10-09T15:00:00.000Z",
  "dispositivo": "android-campo-01",
  "inspector_username": "inspector",
  "app_version": "0.2.0",
  "total": 2,
  "items": [
    {
      "captura_id": "cap-e2e-ok-0001",
      "creado_en": "2026-09-29T15:00:00.000Z",
      "tag": "EXTF-COC-021",
      "resultados": { "manometro_rango": true, "precinto_intacto": true },
      "observaciones": "todo conforme",
      "foto_evidencia_base64": null,
      "gps": { "lat": -0.1833, "lng": -78.4683 },
      "dispositivo": "android-campo-01"
    }
  ]
}
```

### Campos del manifest

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `schema` | string | sí | Exactamente `"brigada.export/v1"`. |
| `generado_en` | ISO string | no | Momento de la exportación. |
| `dispositivo` | string | no | Identificador del teléfono (viaja a `meta.dispositivo`). |
| `inspector_username` | string | no | Usuario de terreno que capturó (para resolver el inspector original). |
| `app_version` | string | no | Versión de la app. |
| `total` | number | no | Nº de items (`= items.length`). |
| `items` | array | **sí** | Lista no vacía de capturas. |

### Campos de cada item

| Campo | Tipo | Obligatorio | Descripción |
|---|---|---|---|
| `captura_id` | string | **sí (obligatorio en import)** | UUID de la captura; **clave de deduplicación**. Si falta en origen, `construirExport` lo genera. El endpoint de importación lo exige: sin él responde 400. |
| `creado_en` | ISO string | recomendado | Fecha de captura en el teléfono ⇒ `inspecciones.created_at` y ancla del vencimiento. |
| `tag` | string | **sí** | Tag del extintor (se normaliza a mayúsculas). |
| `resultados` | objeto `{clave: bool}` | **sí** | Resultado del checklist. Claves desconocidas ⇒ 400. Claves ausentes se interpretan `false`. |
| `observaciones` | string \| null | no | Texto libre (≤ 4000). |
| `foto_evidencia_base64` | string \| null | no | Evidencia; se descarta si el export no incluye fotos. ≤ 4 000 000 chars. |
| `gps` | `{lat,lng}` \| null | no | Posición capturada; si falta se usa la del extintor. |
| `dispositivo` | string \| null | no | Dispositivo del item. |

**Validación en el PC** (`validarLoteExport`): el objeto raíz debe tener `schema` exacto,
`items` como array no vacío y, por item, `tag` string no vacío y `resultados` objeto. Nunca
lanza: devuelve `{ok:false, error}` con mensaje en español.

---

## 2. Endpoint de importación

```
POST /api/v1/inspections/import
Autorización: Bearer <token>   (rol admin; otro rol ⇒ 403)
Content-Type: application/json
```

La pantalla `/importar-terreno` reenvía **un item por petición** (secuencialmente), con los
metadatos del lote anidados en `meta`:

```json
{
  "tag": "EXTF-COC-021",
  "resultados": { "manometro_rango": true },
  "captura_id": "cap-e2e-ok-0001",
  "creado_en": "2026-09-29T15:00:00.000Z",
  "observaciones": "todo conforme",
  "foto_evidencia_base64": null,
  "gps": { "lat": -0.1833, "lng": -78.4683 },
  "dispositivo": "android-campo-01",
  "inspector_username": "inspector",
  "meta": { "archivo_hash": "e2e-lote-0001", "dispositivo": "android-campo-01" }
}
```

### Semántica de importación (fiel)

- `created_at` = `creado_en` (fecha de captura), **no** la hora del PC.
- Vencimiento mensual NFPA anclado a `creado_en` (no a `Date.now()`).
- `inspector_username` se resuelve contra `users`: si existe se firma con su identidad; si no,
  firma el admin con nota `importado_terreno:<username>`.
- `origen = 'campo'`; `captura_id` se persiste tal cual.
- `captura_id` es **obligatorio** (400 si falta o está en blanco).
- Idempotencia por `captura_id`: SELECT previo **y** índice UNIQUE en
  `inspecciones(captura_id)` (migración `007_import_dedup`). Si ya existe ⇒ no inserta y
  responde `duplicado:true`; si dos peticiones del mismo `captura_id` se cruzan, la violación
  de UNIQUE se captura y también se responde `duplicado:true` (200), nunca 500. El SELECT
  previo se conserva, pero el índice + catch es la guarda real contra carreras.
- La habilitación vencida **no rechaza** en importación (queda `importado_hab_vencida`); el
  rechazo por falla crítica del checklist **sí** se aplica (`rechazado=1`) como en línea.

### Respuestas

| Caso | HTTP | Cuerpo |
|---|---|---|
| Creado | `201` | `{ id, tag, fecha, proximo_vencimiento, criticas, rechazado, duplicado:false }` |
| Duplicado | `200` | `{ duplicado:true, captura_id }` |
| `captura_id` faltante/en blanco, `creado_en` inválida/futura/anterior a 2000, o `tag` faltante | `400` | `{ error:"bad_request", msg }` |
| Sin token | `401` | `{ error, msg }` |
| Rol ≠ admin | `403` | `{ error, msg }` |
| Item con checklist desconocido | `400` | `{ error:"bad_request", msg:"Claves de checklist desconocidas: …" }` |

Los errores por item **no abortan** el lote: la pantalla los lista y continúa (salvo 403 o
falta de conexión, que cancelan la tanda).

### Trazabilidad

`meta.archivo_hash` agrupa los contadores de una misma carga en la tabla `importaciones`
(`total`, `creados`, `duplicados`, `errores`), acumulando sobre la última fila de ese hash.

---

## 3. Prueba end-to-end

`server/tests/import_e2e.test.js` modela el ciclo completo: construye el lote con la forma de
`construirExport`, lo importa, comprueba que la BD del PC refleja la inspección (fecha fiel,
vencimiento anclado, rechazo de la crítica) y reimporta el mismo lote verificando
`duplicado:true` sin filas nuevas.
