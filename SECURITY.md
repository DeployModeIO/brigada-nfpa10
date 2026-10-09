# Política de seguridad

## Versiones soportadas

| Versión | Soporte |
|---|---|
| 0.1.x (actual) | Sí |
| < 0.1 | No |

## Cómo reportar una vulnerabilidad

**No** abras issues públicos para problemas de seguridad. Repórtalos de forma privada:

- Usa el reporte privado de vulnerabilidades del repositorio de GitHub
  (*Security &rarr; Report a vulnerability*), o
- Contacta directamente al mantenedor del proyecto por el canal privado acordado.

Incluye: descripción, impacto, pasos de reproducción, versión/commit afectado y, si es
posible, una prueba de concepto. Se acusará recibo en un plazo de hasta 5 días laborables y
se comunicará la evaluación y el plan de corrección.

## Política de secretos

- **Nunca** se commitean secretos, claves, tokens ni ficheros `.env` reales. Los `.env`
  están excluidos vía `.gitignore`.
- `AUTH_SECRET` (firma JWT HS256) **debe** ser un valor aleatorio y único en producción;
  el servidor lo exige cuando `NODE_ENV=production`. Generar con `openssl rand -hex 32`.
- Todas las claves y credenciales se inyectan por variables de entorno
  (ver `server/.env.example`), nunca en el código ni en la configuración versionada.
- Las credenciales de la base de datos del cliente (`CLIENT_DB_URL`) no se persisten ni se
  registran en logs.
- Ante una filtración: revocar/rotar el secreto de inmediato y purgar su rastro del historial
  y de los artefactos generados.

## Protección de datos

- El sistema almacena datos personales mínimos (usuarios/brigadistas) y datos operativos de
  inspección.
- En producción, servir la aplicación exclusivamente sobre **TLS** y restringir CORS mediante
  `ALLOW_ORIGIN`.
- Aplicar el principio de minimización: datos sensibles como el RUT se limitan a la tabla de
  usuarios y no se propagan a metadatos ni a exportaciones más allá de lo necesario.
- Realizar copias de seguridad de la base de datos y controlar el acceso a los artefactos
  exportados.