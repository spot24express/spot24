# SPOT 24 · Guía de despliegue (GitHub + Firebase Spark + Netlify)

Camino **Lite sin tarjeta** (plan Firebase Spark, $0/mes). **Ningún secreto va al repositorio.**

## 1 · Firebase Console (proyecto, plan Spark gratis)

1. Crea el proyecto (producción) en `console.firebase.google.com` — no necesitas tarjeta: el plan **Spark** es suficiente.
2. Registra una **Web app** (`</>` nombre "spot24-web") y copia la configuración SDK → serán las variables `VITE_FIREBASE_*` (deja `storageBucket` VACÍO: sin Storage no hay subida de comprobantes y la verificación es por referencia).
3. **Authentication → Sign-in method**: activa *Correo/contraseña*. En *Authorized domains* añade el dominio de producción (`<site>.netlify.app` y tu dominio propio).
4. **Firestore Database**: crea la base en *modo producción* (las reglas se despliegan en el paso 3).
5. **Cloud Messaging → Web Push certificates**: genera la **clave VAPID** (`VITE_FCM_VAPID_KEY`).
6. **Project settings → Service accounts → Generate new private key**: descarga el JSON. Es la credencial de las Netlify Functions (nunca al repo): la pegarás en Netlify como `FIREBASE_SERVICE_ACCOUNT`.

## 2 · App Check con reCAPTCHA v3 (gratis)

1. **Firebase Console → App Check → Apps → Web**: registra la app con proveedor **reCAPTCHA v3**; copia la clave del sitio → `VITE_RECAPTCHA_V3_SITE_KEY`.
2. El backend arranca en **modo monitoreo** (`APPCHECK_ENFORCE=false`): registra el header sin exigirlo. Tras unos días de tráfico legítimo, activa **Enforce** en Firestore y pon `APPCHECK_ENFORCE=true` en Netlify.
3. Desarrollo local: registra el *debug token* que imprime la consola (o define `VITE_APPCHECK_DEBUG_TOKEN`).

## 3 · Desplegar reglas e índices de Firestore (sin tarjeta)

```bash
npm i -g firebase-tools@14
firebase login
firebase use --add                    # selecciona tu proyecto
firebase deploy --only firestore:rules,firestore:indexes
```

> Las funciones de servidor NO se despliegan a Firebase: viven en Netlify (paso 4). Si algún día activas plan Blaze, los mismos cores se exponen como Cloud Functions (`functions/src/index.ts`) con `firebase deploy --only functions`.

## 4 · Netlify (hosting + funciones + secretos)

1. *Add new site → Import from GitHub* → selecciona el repo. Build y funciones ya vienen en `netlify.toml` (instala `functions/` para el bundling de los cores).
2. **Site configuration → Environment variables**:

| Variable | Valor |
|---|---|
| `VITE_FIREBASE_API_KEY` / `_AUTH_DOMAIN` / `_PROJECT_ID` / `_MESSAGING_SENDER_ID` / `_APP_ID` | Config SDK web (paso 1.2) |
| `VITE_FIREBASE_STORAGE_BUCKET` | **vacío** (Lite) |
| `VITE_RECAPTCHA_V3_SITE_KEY` | clave v3 (paso 2.1) |
| `VITE_FCM_VAPID_KEY` | clave VAPID (paso 1.5) |
| `VITE_ANALYTICS_ENABLED` | `false` |
| `FIREBASE_SERVICE_ACCOUNT` | contenido **completo** del JSON del paso 1.6 |
| `ENC_KEY_HEX` | `openssl rand -hex 32` (64 hex) — cifrado AES-256-GCM |
| `APPCHECK_ENFORCE` | `false` (monitoreo) → `true` tras validar tráfico |

3. Deploy. Las 12 funciones quedan en `/.netlify/functions/*` del propio dominio (sin CORS, sin Cloud Functions, 125 000 llamadas/mes gratis): `fn-reserveStock`, `fn-quoteTotals`, `fn-createOrder`, `fn-cancelOrder`, `fn-verifyPayment`, `fn-updateOrderStatus`, `fn-adjustStock`, `fn-setUserRole`, `fn-revokeUserSessions`, `fn-getAdminMetrics`, `fn-getBcvRate` y la programada `update-bcv-rate` (tasa BCV cada hora).

## 5 · Primer admin

1. Regístrate en la app de producción con tu correo.
2. En Firebase Console copia tu **UID** (Authentication → Users).
3. Desde tu máquina (requiere `firebase login` del paso 3):

```bash
cd functions && npm install
node -e "
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.applicationDefault()});
admin.auth().setCustomUserClaims('TU_UID',{role:'admin'}).then(()=>console.log('admin listo'));
"
```

4. Cierra sesión, inicia sesión de nuevo (el claim viaja en el token) → aparece el acceso a `/admin`. Los demás admins ya se asignan desde el panel (`fn-setUserRole`).

## 6 · Datos reales

1. **Zonas de entrega**: panel admin → Zonas → crea tus zonas con tarifa, peso máximo y ventana.
2. **Productos**: panel admin → Productos → nuevo producto con variantes (precio USD, stock, peso). Imagen: sube la foto a GitHub (Add file → Upload files → `public/img/products/`) y pega su ruta en el editor (`/img/products/foto.jpg`).
3. **Tasa BCV**: la publica sola la función programada cada hora; forzar manual: abre `https://tu-dominio.com/.netlify/functions/fn-getBcvRate` tras el primer ciclo.

## 7 · Verificación post-deploy con curl

```bash
URL=https://tu-dominio.com

# Cabeceras de seguridad presentes
curl -sI $URL | grep -iE 'content-security-policy|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy'

# SPA redirect correcto (200 + index.html)
curl -sI $URL/admin/pagos | head -1

# Función pública de tasa BCV
curl -s $URL/.netlify/functions/fn-getBcvRate

# Manifest con íconos del escudo
curl -s $URL/manifest.webmanifest | grep -o 'icon-512.png'

# Service worker servido y fresco
curl -sI $URL/sw.js | grep -i 'cache-control'
```

## 8 · Presupuestos de rendimiento (7.3) y cierre

1. **Lighthouse (móvil, gama media)** en producción: PWA ≥ 95, Performance ≥ 85, LCP < 2,5 s.
   ```bash
   npm i -g lighthouse && lighthouse $URL --preset=perf --form-factor=mobile --view
   ```
2. **Bundle inicial < 200 KB gzip**: revisa el informe del CI y confirma con `gzip -k` sobre los chunks iniciales.
3. **Instalable**: Chrome DevTools → Application → Manifest (sin errores) → "Install app".
4. **Offline**: carga el catálogo, corta la red, recarga → el catálogo y el carrito siguen; la cola de acciones del carrito reintenta al volver la red.
5. Pipeline en verde + App Check en Enforce + dominios autorizados = lanzamiento.

## Rollback

Netlify → *Deploys* → **Instant rollback** a cualquier deploy previo (atómico). Las funciones se despliegan con el sitio, así que el rollback las incluye.
