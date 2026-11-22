# RONDA 5.160 · Rendimiento del arranque (anti «app lenta»)

**Motivo:** el dueño de la tienda reporta «la app está como lenta, tarda en abrir», con el
Home en skeletons. Diagnóstico con evidencia (bundle de producción medido): cada apertura —
aunque sea la número 500 — repetía el ciclo completo de red (handshake Firestore +
reCAPTCHA/AppCheck + 6-7 consultas en frío) porque **no había persistencia local** y
**App Check arrancaba antes del primer dato**. En internet venezolano eso son 2-6 s de
skeletons SIEMPRE, en WiFi y en datos móviles, en iPhone y en Android.

**Cero conflicto con lo que ya está en producción** (tu push `283d466` de la 5.156-5.158, hoy 21 nov):
esta ronda NO toca ninguno de esos archivos. Capas distintas del código. (La «5.159 layout regalo»
ya viajó dentro de ese push, en el CheckoutPage — no hay nada pendiente de ella.)

## Los 6 archivos de esta ronda

| # | Archivo | Cambio | Efecto |
|---|---|---|---|
| 1 | `src/shared/lib/firebase.ts` | `initializeFirestore` con **persistencia local** (`persistentLocalCache` + gestor multi-pestaña). Caché en memoria si no hay IndexedDB (guardia explícita). **Storage solo si hay bucket** | Reaperturas instantáneas (~0.3 s), funciona sin señal, menos lecturas Firestore |
| 2 | `src/shared/lib/appCheck.ts` | `getAppCheckToken` se **auto-inicializa** si nadie lo hizo aún | El checkout obtiene su token en el momento, igual que antes |
| 3 | `src/app/providers.tsx` | App Check se calienta a los **3 s** de abrir (antes: al primer render, bloqueando el primer dato) | Primer dato más rápido en red mala; compra protegida igual |
| 4 | `src/tests/firebase-persistencia-5160.test.ts` | Test nuevo (4 casos **herméticos**: fijan las llaves con `vi.stubEnv`, así pasan igual en CI y en tu máquina con `.env` real) | Guardián del comportamiento |
| 5 | `vite.config.ts` | **a)** `img/**/*` sale del precache (−1.28 MB en la primera visita; las fotos conservan su CacheFirst runtime de 30 días). **b)** Regla CacheFirst para los **hosts de respaldo 5.115** (`iili.io`, `freeimage.host`, `res.cloudinary.com`, `files.catbox.moe`) — las fotos del respaldo ahora se sirven del cache como las de imgbb. **c)** `@firebase/storage` en chunk propio `firebase-storage-vendor` (fuera del precache, se baja solo si existiera bucket — patrón `jspdf-vendor`, dependencia unidireccional, sin ciclo) | Primera visita más liviana; fotos del respaldo igual de rápidas que las de imgbb |
| 6 | `LEEME-RONDA-5.160.md` | Este documento | — |

**No cambia NADA de:** flujos de compra, inventario/actualizar, PDF, cajero, push, login,
reglas Firestore, funciones Netlify, CSP (`netlify.toml` intacto), precios, BCV, zonas.

## Números verificados (build de esta ronda)

| Métrica | Antes | Después |
|---|---|---|
| Precache del SW | 121 archivos · 3.51 MB | **103 archivos · 2.21 MB (−1.28 MB)** |
| `firebase-vendor` | ~890 kB (con Storage dentro) | **859 kB** (gzip 188 kB) + storage en chunk aparte de 17 kB bajo demanda |
| Fotos del local en precache | 9 (.jpg, 1.01 MB) | **0** (siguen CacheFirst runtime al primer vistazo) |
| Tests raíz | 500 | **504** (500 + 4 de esta ronda) |
| Tests functions | 256 + 14 saltados | **256 + 14 saltados** (intactos) |

## Cómo aplicar (VSC, Windows)

1. Extraer el zip sobre `C:\Users\Erick\spot24` — los 6 archivos vienen con su ruta
   relativa y caen en su sitio (sobrescriben las versiones anteriores).
2. Verificación local:

```bash
npm test                  # raíz: 504 tests (500 + 4 nuevos de esta ronda)
npm --prefix functions test   # 256 tests + 14 saltados por entorno (igual que antes)
npm run build             # typecheck + vite build + service worker PWA
```

3. Commit y push (SOLO estos 6 archivos — así el deploy de la 5.160 va aislado de la 5.161;
   el plan completo del día está en `LEEME-DIA-300-CREDITOS.md`):

```bash
git add src/shared/lib/firebase.ts src/shared/lib/appCheck.ts src/app/providers.tsx src/tests/firebase-persistencia-5160.test.ts vite.config.ts LEEME-RONDA-5.160.md
git commit -m "5.160: rendimiento del arranque (persistencia local, AppCheck diferido, precache liviano)"
git push
```

## Probar en local ANTES del push (opcional, 0 créditos)

**Con `netlify dev`** (app de desarrollo + funciones locales):

```bash
npm i -g netlify-cli     # solo la primera vez
netlify login && netlify link   # vincular el sitio (solo la primera vez)
netlify dev              # abre la URL que imprime (normalmente :8888)
```

- **SÍ puedes probar aquí:** persistencia (abrir catálogo → cerrar → reabrir = instantáneo;
  DevTools → Application → IndexedDB → base `firestore`), AppCheck perezoso (consola),
  storage condicional (Network: no baja `firebase-storage-vendor`). Funciones Netlify
  corren en local.
- **NO aquí:** el service worker y su precache — en desarrollo no se genera (así es
  vite-plugin-pwa). El modo avión completo tampoco: sin SW, recargar offline no sirve la
  página. Para eso necesitas un build real.
- **Ojo:** `netlify dev` usa el Firestore REAL (las lecturas son seguras, pero no crees
  pedidos de prueba reales). Y AppCheck puede quejarse en consola por `localhost` (la clave
  reCAPTCHA no lo tiene registrado): con `APPCHECK_ENFORCE=false` es solo ruido.

**Con Deploy Preview (build REAL, 0 créditos, recomendado antes del push):**

1. `git push origin main:test-5160` (sube tu commit a una rama, NO toca producción).
2. En GitHub abre un Pull Request `test-5160` → `main`.
3. Netlify compila el build de producción en `deploy-preview-…netlify.app` (gratis e
   ilimitado). Prueba ahí el litmus completo (SW, precache, modo avión) desde el iPhone.
4. Si todo bien: **merge del PR = deploy a producción** (el mismo 1 deploy que ibas a
   hacer: 15 créditos). Si algo raro: no mergees y diagnosticamos sin haber tocado nada.

## CUÁNDO hacer push (créditos Netlify) — plan completo en `LEEME-DIA-300-CREDITOS.md`

- Push recomendado: **cuando el dashboard muestre el ciclo nuevo con 300/300** (22 nov).
- **1 deploy exitoso = 15 créditos** (tu dashboard: 13 deploys = 195). Solo el deploy EXITOSO
  consume; el Rollback a un deploy anterior es **gratis**; los Deploy Previews no cobran créditos.
- **Nunca hacer push con menos de ~30 créditos en el ciclo:** si llegan a 0, Netlify PAUSA el
  sitio («Site not available» para tus clientes).

## Litmus post-deploy (probar con el dueño, en su iPhone, y en un Android)

1. **Reapertura instantánea:** abrir la app, cerrarla, reabrir → «Recién llegados» y las
   bahías pintan de inmediato (antes: skeletons 2-6 s).
2. **Sin señal:** modo avión → abrir la app → el catálogo visto antes aparece igual
   (primera vez en la historia de la PWA). Comprar sigue necesitando red (igual que hoy).
3. **Pedido completo de punta a punta** (App Check diferido en el camino del checkout).
4. **PWA instalada + navegador a la vez** sin candado de pestaña (multi-pestaña).
5. Los cambios del admin siguen refrescando la tienda al instante (vigías intactos).

Si algo se viera raro: Netlify → Deploys → **Rollback** al deploy anterior (0 créditos)
y diagnosticamos con calma.
