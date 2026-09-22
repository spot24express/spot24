# SPOT 24 · Guía de despliegue (GitHub + Firebase + Netlify)

Pasos manuales obligatorios. **Ningún secreto va al repositorio.**

## 1 · Firebase Console (proyecto)

1. Crea el proyecto (producción) y un segundo proyecto **staging** para deploy previews de Netlify.
2. **Authentication → Sign-in method**: activa *Correo/contraseña* y *Teléfono*. En *Authorized domains* añade: dominio de producción Netlify (`<site>.netlify.app` y tu dominio propio) y el subdominio staging.
3. **Firestore**: crea la base en modo producción (las reglas se despliegan en el paso 3). Ejecuta el semilla mínimo si quieres: `categories/01..08`.
4. **Storage**: crea el bucket por defecto.
5. **Cloud Messaging → Web Push certificates**: genera la **clave VAPID** (se usará como `VITE_FCM_VAPID_KEY`).

## 2 · App Check con reCAPTCHA Enterprise (sección 6.2)

1. En **Google Cloud Console → reCAPTCHA Enterprise**, crea una clave de tipo *Website* para el dominio de producción.
2. **Firebase Console → App Check → Apps → Web**: registra la app con la clave reCAPTCHA Enterprise.
3. Copia la clave del sitio a `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY`.
4. Para desarrollo local: registra en *Apps → Manage debug tokens* el token de debug que imprime la consola (o define `VITE_APPCHECK_DEBUG_TOKEN`).
5. Tras el primer deploy, activa **Enforce** en Firestore, Storage y Functions.

## 3 · Desplegar Functions, reglas e índices

```bash
npm i -g firebase-tools@14
firebase login
firebase use --add                     # selecciona proyecto prod y staging

# Secret de cifrado AES-256-GCM (64 hex = 32 bytes):
openssl rand -hex 32
firebase functions:secrets:set ENC_KEY_HEX   # pega el hex generado

firebase deploy --only functions,firestore:rules,firestore:indexes,storage
```

Funciones desplegadas: `fn-reserveStock`, `fn-quoteTotals`, `fn-createOrder`, `fn-cancelOrder`, `fn-verifyPayment`, `fn-updateOrderStatus`, `fn-adjustStock`, `fn-setUserRole`, `fn-revokeUserSessions`, `fn-getAdminMetrics`, `fn-getBcvRate`, `updateBcvRate` (programada cada hora).

## 4 · GitHub

```bash
git init && git remote add origin git@github.com:<org>/spot24-pwa.git
git add . && git commit -m "feat: SPOT 24 PWA inicial" && git push -u origin main
```

- En *Settings → Branches*: protege `main` (PR obligatorio + checks `web`, `functions`, `rules` requeridos en verde).
- En *Settings → Secrets and variables → Actions*: no se necesitan tokens para el CI actual (no usa claves); si añades tareas de deploy desde CI, crea `FIREBASE_SERVICE_ACCOUNT` ahí — jamás en archivos.
- Dependabot queda activo con `.github/dependabot.yml`.

## 5 · Netlify

1. *Add new site → Import from GitHub* → selecciona el repo.
2. Build command y public ya vienen en `netlify.toml`.
3. **Site configuration → Environment variables** (por entorno):

| Variable | Producción | Deploy preview |
|---|---|---|
| `VITE_FIREBASE_*` (6) | proyecto prod | proyecto **staging** |
| `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` | clave prod | clave staging (o vacía + debug token) |
| `VITE_APPCHECK_DEBUG_TOKEN` | — | token de debug staging |
| `VITE_FCM_VAPID_KEY` | prod | staging |
| `VITE_ANALYTICS_ENABLED` | true (con consentimiento) | false |

4. Activa *Deploy previews* (ya configurado con `VITE_USE_STAGING_FIREBASE=true`).
5. Conecta el dominio personalizado y habilita HTTPS (Netlify emite certificado).

## 6 · Primer admin

1. Regístrate en la app de producción con tu correo.
2. En Firebase Console copia tu **UID**.
3. Otorga el rol (una sola vez, desde tu máquina):

```bash
cd functions && npm run build
node -e "
const admin=require('firebase-admin');
admin.initializeApp({credential:admin.credential.applicationDefault()});
admin.auth().setCustomUserClaims('TU_UID',{role:'admin'}).then(()=>console.log('admin listo'));
"
```

(Requiere `GOOGLE_APPLICATION_CREDENTIALS` o `firebase login:ci` local. Alternativa: desde la función `fn-setUserRole` con un admin inicial otorgado por consola.)

## 7 · Verificación post-deploy con curl (sección 10.6)

```bash
URL=https://tu-dominio.com

# Cabeceras de seguridad presentes
curl -sI $URL | grep -iE 'content-security-policy|strict-transport|x-frame|x-content-type|referrer-policy|permissions-policy'

# SPA redirect correcto (200 + index.html)
curl -sI $URL/admin/pagos | head -1

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
2. **Bundle inicial < 200 KB gzip**: revisa el informe del CI (`du -ck dist/assets/*.js`) y aplica `gzip -k` sobre los chunks iniciales para confirmar.
3. **Instalable**: Chrome DevTools → Application → Manifest (sin errores) → "Install app".
4. **Offline**: carga el catálogo, corta la red, recarga → el catálogo y el carrito siguen; la cola de acciones del carrito reintenta al volver la red.
5. Pipeline en verde + App Check en Enforce + dominios autorizados = lanzamiento.

## Rollback

Netlify → *Deploys* → **Instant rollback** a cualquier deploy previo (atómico). Para Functions: `firebase functions:rollback` o re-desplegar la revisión anterior desde CI.
