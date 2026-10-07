# 🛢️🔥 BRIGADA O&G — Inspección de Equipos CPI (NFPA 10 / API RP 14G)

> **Transformación V2.1 Oil & Gas** de `brigada-nfpa10`. Misma arquitectura de nivel
> empresarial, nuevo dominio: plantas de hidrocarburos, módulos offshore y áreas ATEX.

Sistema full-stack de gestión e inspección de **Equipos de Protección Contra Incendios**
(extintores portátiles y rodantes, SCBA, gabinetes) para instalaciones **Oil & Gas**.

## 🏭 Dominio Oil & Gas

| Aspecto | Estándar aplicado |
|---|---|
| Inspecciones mensual / anual / 6-años | NFPA 10 §7.2 / §7.3 |
| Clase B junto a motores y turbinas en áreas encerradas | API RP 14G |
| Agente AFFF (espuma acuosa) | Reglas de hidrostática propias en `nfpa_reglas` |
| Ubicaciones tipo | Planta Compresora · Módulo POB · Tanques · Muelle de Carguío |
| Clasificación de zonas | ATEX Zona 0 / 1 / 2 |

## 🎨 Diseño V2.1 (estándares)

- **HMI de Alto Desempeño** (Rockwell PROCES-WP023): fondos neutros, color SOLO
  para estado/alarmas. Paleta clara industrial por defecto.
- **Solarized Dark oficial** como tema opcional (base03/base02 + acentos ajustados AA).
- **ANSI Z535 / ISO 7010**: verde=condición segura, ámbar=advertencia, rojo=peligro.
- Tokens semánticos con **contraste WCAG AA ≥ 4.5 verificado por tests**.
- Responsivo: rail lateral en PC/tablet, navegación inferior en móvil.

## 🧱 Arquitectura

- `client/` — React + Vite (PWA: QR scanner, offline, mapa de planta, export PDF).
- `server/` — Node/Express, multi-BD (SQLite/Postgres/MySQL/SQLServer/Oracle),
  webhooks, integraciones, motor NFPA 10 + API RP 14G como reglas en BD.
- `docker/` — despliegue contenedorizado (opcional; el ecosistema local corre en Podman).

## 🚀 Uso

```bash
server:  npm install && npm run test:unit && npm start
client:  npm install && npm test && npm run dev
```

## ✅ Suite de verificación

- Servidor: **43/43 tests** (NFPA, seeds O&G, webhooks, seguridad).
- Cliente: **32/32 tests** (tokens/temas, contraste AA, responsivo, QR, PWA).
- Transformación V2.1: **75/75 PASS**.

---
DeployModeIO · transformado por DeepChicken (2026-10)
