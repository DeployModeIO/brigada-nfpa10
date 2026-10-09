# ADR-001 — Captura local en Android y exportación/importación fiel al PC

- **Estado:** Accepted
- **Fecha:** 2026-10-09
- **Decisores:** equipo Brigada NFPA-10
- **Relacionado:** `docs/ARCHITECTURE.md`, `server/docs/API.md`

## Contexto

El trabajo de inspección se realiza en terreno con tablets/teléfonos Android sin
conectividad garantizada, mientras que el servidor portable corre en un PC que actúa como
fuente de verdad. Hay que trasladar las capturas de campo al PC sin perder fidelidad.

El producto dejó de estar atado a la norma air-gap de "Minería Suite" y pasa a ser un
producto independiente; esto habilita decisiones propias sobre la app de terreno, los mapas
y el transporte de datos.

## Decisión

Adoptar la **opción B ("fidelidad")**:

1. **Android = APK con Capacitor + captura persistente LOCAL** (sin auto-drenado), login
   permanente y **exportación manual** del fichero de capturas.
2. **PC = servidor portable** que **importa** los datos de terreno mediante un **endpoint de
   importación dedicado, fiel e idempotente**.
3. El endpoint preserva: **fecha de captura**, **inspector original** y **vencimiento NFPA
   anclado a la fecha de captura**; y deduplica por **`captura_id` (UUID)** generado en el
   dispositivo.
4. La **base de datos del PC es la fuente de verdad**; el PC es quien consolida.

## Opciones consideradas

### 1. App de terreno

| Opción | Pros | Contras |
|---|---|---|
| PWA sobre HTTPS | Sin empaquetado ni distribución de APK | Requiere certificado/host; límites de service worker; ergonomía mediocre de cámara y ficheros en campo |
| **Capacitor APK (elegida)** | Acceso nativo a cámara y sistema de ficheros; persistencia local robusta; distribución interna sin tienda | Empaquetado y firma del APK; superficie nativa a mantener |

### 2. Mapas

| Opción | Pros | Contras |
|---|---|---|
| Google Maps embebido | Mapas ricos y familiares | API key + red, coste/licencia, no funciona offline |
| Deep-link a Google Maps del dispositivo | Sin integración ni clave | Depende de red/BD del dispositivo; sin contexto embebido |
| **Leaflet offline con tiles locales (elegida)** | 100 % offline, sin llamadas externas ni CDNs | Peso de los tiles; menor frescura de cartografía |

### 3. Transporte e ingesta en el PC

| Opción | Pros | Contras |
|---|---|---|
| Reutilizar `POST /inspections` tal cual | Cero backend nuevo; camino ya probado | Sobrescribe marcas con "ahora", atribuye al usuario logueado, **recalcula el vencimiento NFPA desde la importación**, sin procedencia ni dedupe &rarr; **infiel y propenso a duplicados** al reimportar |
| **Endpoint de importación dedicado (elegida)** | Preserva fecha de captura, inspector original y vencimiento anclado a la captura; **idempotente** (dedupe por `captura_id`); reintentos seguros; procedencia auditable | Un segundo camino de escritura que debe compartir la lógica de validación y del motor NFPA |

## Consecuencias

**Positivas**

- **Fidelidad y procedencia**: la fecha real de captura y el inspector original se conservan;
  el vencimiento NFPA queda anclado a la captura, no al momento de importar.
- **Idempotencia**: reimportar el mismo fichero no genera duplicados (`captura_id` UUID).
- **Desacople offline-first**: la captura en terreno no depende de conectividad; el PC consolida.
- **Sin pérdida silenciosa**: al no haber auto-drenado, el brigadista controla cuándo exporta.

**Negativas / costes**

- Existen **dos caminos de escritura** de inspecciones (`POST /inspections` en línea y el
  endpoint de importación); deben **compartir** la validación y el motor NFPA-10 para no divergir.
- Requiere un **formato de exportación versionado** en el dispositivo y persistencia local fiable.
- La exportación es un **paso manual** y depende del operador.
- Mayor superficie de **pruebas** (fidelidad, dedupe, reimportación, habilitaciones en import).

**Seguimiento**

- Definir y versionar el esquema del fichero de exportación.
- Validar habilitaciones de brigadistas usando la **fecha de captura** durante la importación.
- Registro de auditoría que distinga inspecciones **importadas** de las **directas**.

## Referencias

- `docs/ARCHITECTURE.md` — flujo de datos de terreno.
- `server/docs/API.md` — contrato de `POST /inspections` y rutas de integración.