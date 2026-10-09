# Guía de contribución

Gracias por contribuir a **Brigada NFPA-10**. Este documento resume el flujo de trabajo
para proponer cambios.

## Requisitos

- Node.js >= 22 (el cliente lo exige; se desarrolla y prueba con 22).
- npm.

## Puesta en marcha

```bash
# Server
cd server
npm install
cp .env.example .env      # opcional; hay defaults de desarrollo
npm run seed              # datos de ejemplo (idempotente)
npm run dev               # http://localhost:3200

# Cliente
cd client
npm install
npm run dev               # http://localhost:5199
```

## Ejecución de pruebas (obligatorio antes de un PR)

```bash
# Server: unit (node --test) + smoke E2E
cd server && npm test

# Cliente: build de pruebas + node --test + build de producción
cd client && npm test && npm run build
```

No se añaden dependencias ni se modifica `package.json` sin justificarlo y acordarlo en el PR.

## Nomenclatura de ramas

Formato: `<tipo>/<descripción-corta-en-kebab-case>`.

- `feat/…` nueva funcionalidad
- `fix/…` corrección de errores
- `chore/…` mantenimiento, documentación, CI

Ejemplos: `feat/import-endpoint`, `fix/cola-offline-retry`, `chore/ci-node22`.

## Commits — Conventional Commits

Formato: `<tipo>(<alcance opcional>): <descripción en imperativo>`.

Tipos permitidos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
`ci`, `chore`, `revert`.

Ejemplos:

```
feat(import): endpoint idempotente de importación de terreno
fix(offline): reintento con backoff en la cola IndexedDB
docs(adr): ADR-001 captura Android y exportación/importación
```

- Asunto en minúscula, sin punto final, <= 72 caracteres.
- Cuerpo opcional para explicar el "qué" y el "porqué".
- Breaking changes: `feat!:` o una línea `BREAKING CHANGE:` en el pie.

## Estilo de código

- TypeScript/JavaScript con indentación de 2 espacios; finales de línea LF y newline final
  (ver `.editorconfig` y `.gitattributes`).
- Comentarios y textos de interfaz **en español**.
- Sin secretos ni credenciales en el código; ver `SECURITY.md`.
- No introducir dependencias nuevas sin justificarlo en el PR.

## Checklist de PR

Usa la plantilla `.github/PULL_REQUEST_TEMPLATE.md`. Antes de solicitar revisión:

- [ ] `cd server && npm test` en verde.
- [ ] `cd client && npm test && npm run build` en verde.
- [ ] Sin cambios en `client/src/**` o `server/src/**` si el PR es de infraestructura o documentación.
- [ ] Sin secretos, ficheros `.env` ni artefactos generados.
- [ ] Documentación y `CHANGELOG.md` actualizados cuando corresponda.