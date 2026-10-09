# APK Android (Capacitor) — Brigada NFPA-10 · cliente de terreno

Guía para compilar el **APK de campo**: una app Android que corre la web del cliente
dentro de un WebView, con permisos nativos de **GPS** y **cámara**, red hacia el
**servidor portátil del PC por la LAN** y **login permanente** en modo captura.

Todo lo nativo es **opcional y degradable**: si un plugin de Capacitor no está disponible
(web de escritorio, permiso denegado), la app cae al camino web de siempre (jsQR,
`navigator.geolocation`). El build y los tests web no cambian.

---

## 1. Requisitos

| Herramienta | Uso |
|---|---|
| Node ≥ 22 | build web + CLI de Capacitor (ya en `engines`) |
| **Android SDK** (`ANDROID_HOME`) + **platform-tools** | compilar el APK |
| **JDK 17+** | Gradle/AGP de Capacitor 8 |
| Teléfono Android con USB (o `adb` por red) | instalar/probar |

> Nota: `npx cap add android` / `npx cap sync android` **no** necesitan el SDK: solo copian
> los assets web y sincronizan plugins. El SDK/JDK solo hacen falta para generar el APK
> (`gradlew assembleDebug/assembleRelease`).

## 2. Dependencias y scripts

Dependencias añadidas (`client/package.json`):

- `@capacitor/core`, `@capacitor/android`
- `@capacitor/geolocation` (GPS nativo)
- `@capacitor/preferences` (base de API guardada, clave `apiBase`)
- `@capacitor/barcode-scanner` (escáner QR nativo)
- `@capacitor/cli` (dev)

Scripts:

```bash
npm run build          # tsc --noEmit && vite build → dist/  (web intacta)
npm run cap:sync       # npm run build && npx cap sync android
npm run apk:debug      # cap:sync && npx cap open android (abre Android Studio)
```

## 3. Build del APK

### 3.1 Compilar la web en MODO CAPTURA apuntando al PC

```bash
cd client
VITE_MODO_CAPTURA=local VITE_API_URL=http://<IP-PC>:8080/api/v1 npm run build
```

- `VITE_MODO_CAPTURA=local` → activa captura local: la cola IndexedDB **nunca** se sube
  sola (transferencia manual por `/exportar`) y el **login es permanente**.
- `VITE_API_URL` → base de la API de la LAN. Sustituir `<IP-PC>` por la IP del equipo que
  corre el servidor (p.ej. `192.168.1.10`) y `:8080` por el puerto del portable (o `:3200`
  en dev). **Debe** ser alcanzable desde el teléfono (misma red).

### 3.2 Sincronizar y generar el APK

```bash
npx cap sync android      # copia dist/ y sincroniza los plugins nativos
```

Con Android SDK y JDK instalados y `ANDROID_HOME` exportado:

```bash
cd android
./gradlew assembleDebug        # → android/app/build/outputs/apk/debug/app-debug.apk
# Firmado (release):
./gradlew assembleRelease      # requiere keystore configurado en android/app/build.gradle
```

Instalar en el teléfono:

```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

> Sin SDK/JDK no se puede generar el APK. En ese caso `npx cap sync android` sirve como
> verificación de que el proyecto nativo está correcto; el APK se compila en una máquina
> con Android Studio / SDK.

### 3.3 Alternativa sin LAN: `adb reverse` (prueba local)

Para probar contra el PC sin depender de la IP, y **sin recompilar** con `VITE_API_URL`:

```bash
adb reverse tcp:3200 tcp:3200     # el device ve http://localhost:3200 del PC
```

En ese caso el default nativo de la API es `http://localhost:3200/api/v1` (funciona tras
`adb reverse`). También se puede fijar una base en caliente guardando la clave `apiBase`
con `@capacitor/preferences` desde la app/consola.

## 4. Cómo se resuelve la base de la API (`API_BASE`)

`src/lib/api.ts` expone el helper **puro** `resolverApiBase(opts)` con esta prioridad:

1. `VITE_API_URL` (build).
2. base guardada en el dispositivo (Preferences `apiBase`).
3. **solo en web**: `window.location.origin + /api/v1` (mismo origen).
4. default local `http://localhost:3200/api/v1`.

En el APK el WebView usa origen `https://localhost`, que **no** es un servidor real: por eso
en nativo **nunca** se usa el origen del WebView. La detección es diferida
(`inicializarApiBase()`, llamada en `main.tsx`) mediante `import` guardado de
`@capacitor/core` (`Capacitor.isNativePlatform()`), sin tocar la web.

## 5. Login permanente (MODO_CAPTURA)

- `src/lib/api.ts`: con `MODO_CAPTURA` un **401 no limpia el token ni dispara**
  `nfpa:unauthorized` (el token caducado o una base mal configurada no expulsan al usuario).
- `src/context/AuthContext.tsx`: con `MODO_CAPTURA` se **ignora** el evento
  `nfpa:unauthorized` y se conserva la sesión decodificada del token.
- Fuera de captura, el comportamiento online/offline es **idéntico** al actual.

## 6. Rutas nativas y fallbacks web

**GPS** (`src/lib/nativo.ts` → `obtenerUbicacion()`):

- Nativo: `@capacitor/geolocation` (`requestPermissions` + `getCurrentPosition`).
- Web: `navigator.geolocation` (comportamiento y mensajes originales).

**QR** (`src/lib/nativo.ts` → `escanearNativo()`, usado en `useQrCamera`):

- Nativo: `@capacitor/barcode-scanner` (escáner del sistema; `QR_CODE`).
- Si el plugin no está, el usuario cancela o no detecta código → cae a `getUserMedia` + jsQR.
- La web mantiene su camino **sin cambios**.

## 7. Permisos Android y seguridad de red

`android/app/src/main/AndroidManifest.xml`:

- `INTERNET` (ya presente), `ACCESS_FINE_LOCATION`, `ACCESS_COARSE_LOCATION`, `CAMERA`.
- `android:networkSecurityConfig="@xml/network_security_config"`.

`android/app/src/main/res/xml/network_security_config.xml`:

- `base-config cleartextTrafficPermitted="true"` → **ajuste de TEST**: el servidor de campo
  es http en la LAN. Para producción, endurecer con un `<domain-config>` que fije solo la
  IP/dominio del servidor (bloque comentado en el propio XML) y volver el base-config a
  `false`.
- `capacitor.config.ts` usa `android.allowMixedContent: true` por el mismo motivo.

## 8. Servidor: CORS (`ALLOW_ORIGIN`) y firewall

El APK llega con origen `https://localhost` (y `capacitor://localhost`). En
`server/scripts/brigada-demo.js` el default ya los incluye:

```
http://localhost:<PORT>,https://localhost,capacitor://localhost
```

`server/.env.example` documenta el ejemplo (p.ej. para el portable `:8080`). Si el server
se lanza con `ALLOW_ORIGIN` propio, **añadir** esos dos orígenes. Además, abrir el puerto
del servidor en el **firewall del PC** para la red local (p.ej. `8080/tcp`).

## 9. Verificación

```bash
cd client
npm test            # tests (incluye tests/nativo.api.test.mjs: resolverApiBase)
npm run build       # web (tsc + vite), sin cambios
npx cap sync android
```