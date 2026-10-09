# Runbook de despliegue — Brigada NFPA-10

Guía operativa para poner a correr el **servidor del PC** (fuente de verdad) y el
**APK de terreno**, y para transferir capturas de campo de forma fiel y sin duplicados.

---

## 1. Servidor del PC

### 1.1 Binario portable `BrigadaDemo`

El ejecutable empaqueta API + web embebida y arranca un único servicio en `http://localhost:8080`
(abre el navegador solo). Doble clic, o:

```bash
./BrigadaDemo-linux-x64        # Windows: BrigadaDemo-win-x64.exe
PORT=8080 ./BrigadaDemo-linux-x64   # puerto alternativo
```

Por defecto ya publica los orígenes del APK (`http://localhost:8080`, `https://localhost`,
`capacitor://localhost`). El seed de demo puede activarse con `DEMO_SEED=1` en una BD nueva.

### 1.2 Docker / Podman

```bash
# AUTH_SECRET es OBLIGATORIO en producción
export AUTH_SECRET=$(openssl rand -hex 32)
docker compose -f docker/docker-compose.local.yml up -d      # API+web en :3200, SQLite en volumen
```

El runtime es air-gap (API+web embebidas, SQLite en volumen, sin CDN). La BD vive en el
volumen `brigada-data`; **es la fuente de verdad** y debe respaldarse.

### 1.3 Desarrollo

```bash
cd server && npm install && cp .env.example .env && npm run seed && npm run dev
```

### 1.4 Operación local (PC de faena)

Arranque persistente del portable (sobrevive al cierre del terminal), con log en la
propia carpeta:

```bash
mkdir -p ~/servidor-brigada && cd ~/servidor-brigada
cp /ruta/a/entrega/PC-SERVIDOR/BrigadaDemo-linux-x64 .
PORT=3205 setsid nohup ./BrigadaDemo-linux-x64 > servidor.log 2>&1 &
```

- **BD SQLite**: se crea **junto al binario**, en `~/servidor-brigada/brigadademo.db`.
- **Parar** el servidor:
  ```bash
  pgrep -f BrigadaDemo    # localizar el PID
  kill <pid>
  ```
- **Copia de seguridad**: basta con copiar la BD (idealmente con el servidor parado):
  `cp brigadademo.db respaldos/brigadademo-$(date +%Y%m%d-%H%M).db`
- **Aviso**: en el primer arranque (BD vacía) se siembran **usuarios demo** con
  contraseñas conocidas (`DEMO_SEED`). Para uso real: cambiar las contraseñas de
  inmediato o desactivar el seed (`DEMO_SEED=0`).

---

## 2. CORS: `ALLOW_ORIGIN`

El APK de Capacitor llega con origen **`https://localhost`** (WebView) o
**`capacitor://localhost`** (esquema nativo). El servidor debe permitirlos, además del
origen web del PC, separados por coma:

```bash
# .env del servidor (o variable de entorno)
ALLOW_ORIGIN=http://localhost:8080,https://localhost,capacitor://localhost
```

- En el portable `BrigadaDemo` ese default ya está aplicado.
- En docker se toma de `${ALLOW_ORIGIN}` (ver `docker/docker-compose.local.yml`).
- Si se usa un `ALLOW_ORIGIN` propio, **añadir** los dos orígenes del APK o el dispositivo
  recibirá errores de CORS.

Referencia: `server/.env.example` y `client/CAPACITOR.md` §8.

---

## 3. Firewall del PC

El teléfono debe alcanzar el servidor por la **LAN**. Abrir el puerto del servidor
(`8080/tcp` en el portable, `3200/tcp` en docker) para la red local:

```bash
# Linux (ufw) — ajustar la subred a la de la faena
sudo ufw allow from 192.168.0.0/16 to any port 8080 proto tcp
# firewalld
sudo firewall-cmd --add-port=8080/tcp --permanent && sudo firewall-cmd --reload
```

Comprobar desde el teléfono que `http://<IP-PC>:8080/health` responde.

---

## 4. Build del APK de terreno

### 4.1 Prerrequisitos (bloqueante si faltan)

| Requisito | Nota |
|---|---|
| Node ≥ 22 | build web + CLI de Capacitor |
| **JDK 17/21** | Gradle/AGP de Capacitor 8 |
| **Android SDK** + `platform-tools` (`ANDROID_HOME` exportado) | compilar el APK |

> En esta máquina el build del APK **no pudo completarse** por ausencia de **JDK 17/21 +
> Android SDK**. `npx cap sync android` sí funciona (solo copia assets y sincroniza plugins);
> `./gradlew assembleRelease` requiere SDK/JDK y debe ejecutarse en una máquina con
> Android Studio / SDK.

### 4.2 Compilar (modo captura, apuntando al PC de la LAN)

```bash
cd client
VITE_MODO_CAPTURA=local VITE_API_URL=http://<IP-PC>:8080/api/v1 npm run build \
  && npx cap sync android \
  && cd android && ./gradlew assembleRelease
```

- `VITE_MODO_CAPTURA=local` → captura local persistente, sin auto-drenado, login permanente.
- `VITE_API_URL` → base de la API en la LAN (`<IP-PC>` = IP del equipo con el servidor).
- Salida: `android/app/build/outputs/apk/release/app-release.apk` (el release requiere keystore
  configurado en `android/app/build.gradle`; para pruebas usar `assembleDebug`).

Instalar:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### 4.3 Alternativa de prueba sin LAN: `adb reverse`

Para probar contra el PC sin recompilar con `VITE_API_URL` (el default nativo es
`http://localhost:3200/api/v1`):

```bash
adb reverse tcp:3200 tcp:3200     # el teléfono ve el :3200 del PC como localhost
```

---

## 5. Ciclo de transferencia (store-and-forward)

1. El brigadista captura en el APK sin cobertura (cola local IndexedDB persistente).
2. En `/exportar` genera el fichero `brigada-terreno-YYYYMMDD-HHmm.json` (`brigada.export/v1`).
3. En el PC, un `admin` abre `/importar-terreno`, selecciona el JSON y confirma la importación.
4. El servidor importa **fiel** (fecha, inspector, vencimiento anclado) y **deduplica** por
   `captura_id`: reimportar el mismo fichero devuelve `duplicado:true` sin filas nuevas.

Contrato exacto (esquema JSON y endpoint): [CONTRATO-EXPORT-IMPORT.md](CONTRATO-EXPORT-IMPORT.md).

---

## 6. Verificación post-despliegue

```bash
curl -s http://<IP-PC>:8080/health
# Import fiel E2E (servidor):
cd server && npm run test:unit                       # incluye tests/import_e2e.test.js
cd server && SMOKE_PORT=3299 npm run test:smoke      # usar un puerto libre
```

---

## 7. Seguridad (transporte)

- **El APK de campo habla HTTP en claro con el servidor del PC dentro de la LAN.** Eso es
  **SOLO para pruebas / test de campo** en una red de confianza. En ese escenario el
  **Bearer token viaja sin cifrar** y puede ser interceptado por cualquiera en el mismo
  segmento de red.
- En el APK, `network_security_config.xml` mantiene `base-config
  cleartextTrafficPermitted="false"` y solo permite la IP LAN del PC mediante un
  `<domain-config>` comentado (descomentar y sustituir la IP real para el test). El
  `allowMixedContent` de `capacitor.config.ts` está igualmente marcado como TEST-only.
- **Producción: usar HTTPS.** Servir el servidor por HTTPS, dejar el `base-config` en
  `false`, NO descomentar ningún `<domain-config>` y poner `android.allowMixedContent` en
  `false`. Con HTTPS el token viaja cifrado.
- El APK fija `android:allowBackup="false"` para impedir que el JWT (localStorage/IndexedDB
  del WebView) se extraiga por `adb backup`/auto-backup.

### HTTPS en producción

El servidor puede servir **HTTPS nativo en el mismo puerto** definiendo `TLS_CERT` y
`TLS_KEY` (rutas a los PEM, relativas a `server/`):

```bash
cd server
./scripts/gen-cert.sh 192.168.1.100   # autofirmado 10 años; SAN localhost + la IP LAN del PC
# en server/.env (o el entorno):
#   TLS_CERT=./certs/cert.pem
#   TLS_KEY=./certs/key.pem
```

Al reiniciar, el log indica `escuchando en https://0.0.0.0:<puerto> (HTTPS)`; sin esas
variables el arranque HTTP queda intacto.

- `server/certs/` está gitignored: el par se genera por máquina y **nunca se versiona**.
- Certificado autofirmado = **solo LAN interna/empresa** de confianza; distribuya
  `cert.pem` a los dispositivos de confianza. En internet público use un certificado de
  una CA real (Let's Encrypt o la CA corporativa).
- Al activar HTTPS, actualice `ALLOW_ORIGIN` a `https://<IP>:<puerto>` y recompile el APK
  con `VITE_API_URL=https://<IP>:<puerto>/api/v1` (sin cleartext ni mixed content).

Referencia: `client/CAPACITOR.md` §7 y `docs/CONTRATO-EXPORT-IMPORT.md`.
