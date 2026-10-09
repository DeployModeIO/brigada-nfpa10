# Arquitectura — Brigada NFPA-10

## Visión general

Aplicación de inspección de extintores NFPA-10, **offline-first**, con dos superficies
principales y una app de terreno:

- **Cliente web (PWA)** — React 18 + Vite + TypeScript + Tailwind 4 (`client/`).
- **Servidor** — Node/Express con capa multi-BD (`server/`), empaquetable como binario portable.
- **APK Android** (propuesto) — captura de campo persistente con exportación manual.

## Componentes

| Componente | Descripción |
|---|---|
| Cliente web (PWA) | UI de inspección, administración, mapa de planta y exportaciones. Service worker manual y cola offline en IndexedDB. |
| Servidor (API `/api/v1`) | Autenticación JWT por roles, dominio NFPA-10, integración con la BD del cliente, webhooks y exportaciones. |
| Binario portable (PC) | El servidor empaquetado (Linux/Windows) que sirve web + API desde un único ejecutable. La **BD del PC es la fuente de verdad**. |
| APK Android (propuesto) | Envoltura Capacitor con captura persistente LOCAL y exportación manual de fichero hacia el PC (ver ADR-001). |

## Modelo de datos (multi-BD)

`server/src/db/index.js` expone una API uniforme (`query/all/get/run/exec/transaction/init`)
con placeholders `?` y migraciones idempotentes. El driver se elige por entorno:

- `sqlite` (default; better-sqlite3, incluido).
- `postgres` (`pg`, opcional) y `mysql` (`mysql2`, opcional).
- `sqlserver` / `oracle`: stubs 501 (pendientes).

## Flujo de datos de terreno

```
Captura local (Android, persistente, sin auto-drenado)
        │  exportación manual (fichero)
        ▼
Importación en el PC (endpoint dedicado, fiel e idempotente, dedupe por captura_id)
        ▼
Base de datos del PC  ←  fuente de verdad
```

La importación preserva la **fecha de captura**, el **inspector original** y el
**vencimiento NFPA anclado a la fecha de captura**. Detalle en
`docs/adr/ADR-001-terreno-android-export-import.md`.

### Field data flow (store-and-forward)

El terreno usa **store-and-forward**: se almacena local y se reenvía después, nunca en línea.

1. **Store** — el APK (WebView Capacitor) persiste cada captura en IndexedDB con `captura_id`
   y `creado_en`; `VITE_MODO_CAPTURA=local` desactiva el auto-drenado (nada se sube solo).
2. **Forward (manual)** — el brigadista exporta un fichero JSON `brigada.export/v1` desde
   `/exportar` (o lo comparte por Web Share).
3. **Ingest (PC)** — un `admin` importa el fichero en `/importar-terreno`; cada item se
   reenvía a `POST /api/v1/inspections/import`.
4. **Reconcile** — el servidor escribe de forma **fiel** (`created_at` = captura, inspector
   original resuelto por `username`, vencimiento NFPA anclado a la captura) e **idempotente**
   (dedupe por `captura_id`: reimportar ⇒ `duplicado:true`, sin filas nuevas). La BD del PC
   sigue siendo la fuente de verdad.

Contrato detallado: `docs/CONTRATO-EXPORT-IMPORT.md`. Runbook: `docs/DEPLOY.md`.

## Modelo offline

- Service worker manual que cachea el shell de la aplicación.
- Cola de inspecciones en **IndexedDB** (librería `idb`) con reintentos y backoff; el trabajo
  de campo no depende de la conectividad.
- En Android la captura es local y persistente; el vaciado ("drain") al PC es **manual** por
  decisión de diseño.

## Modelo de seguridad

- **JWT HS256** con roles `admin | inspector | supervisor`; `AUTH_SECRET` aleatorio obligatorio
  en producción.
- **Habilitaciones** de brigadistas (403 `habilitacion_vencida`; supervisores/admin exentos con
  nota de auditoría).
- **TLS en producción**, CORS restringido por `ALLOW_ORIGIN`, `helmet`, rate-limit y límite de
  tamaño del cuerpo JSON.
- **Auditoría**: se registra el origen de cada inspección (directa vs importada), su inspector y
  sus fechas.
- **Secretos por entorno**, nunca en el repositorio (ver `SECURITY.md`).
## Ergonomía en tablet de campo (decisión intencional)

En tabletas de ~800×1280 px la aplicación muestra deliberadamente la carcasa móvil
(navegación inferior); la barra lateral solo aparece en pantallas ≥1024 px. En terreno el
equipo se sostiene con una mano y el pulgar debe alcanzar la navegación sin estiramientos:
una barra lateral a 800 px robaría ancho al checklist y obligaría a toques imprecisos. Esto
NO es un fallo de breakpoint sino diseño de ergonomía de campo; no "corregir".
