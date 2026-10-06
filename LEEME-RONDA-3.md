# SPOT 24 · Ronda 3 — Solo Bs para el cliente, teléfono que sí funciona, métricas sin error falso y rol Gerente

**30 archivos** · Validado antes de empaquetar: typecheck frontend ✓ · typecheck netlify ✓ · typecheck functions ✓ · 27/27 tests frontend ✓ · 8/8 tests backend ✓ · build PWA ✓

Requiere estar al día con las rondas anteriores (spot24-fase-a + Ronda 2 de checkout).

---

## Resumen de lo que se corrigió

| Reportaste | Se hizo |
|---|---|
| **«El cliente no debe ver nada en dólares, solo Bs.»** | Toda la UI de cliente quedó 100% en bolívares: PriceTag, Carrito, Checkout (montos, selector de zona, revisión, confirmación), Mis pedidos, Detalle del pedido y Éxito. El servidor ahora calcula y guarda el **desglose oficial en Bs** (subtotalVes, shippingVes, ivaVes) en la cotización y en cada orden; el cliente ya no convierte nada (y las órdenes viejas se muestran bien usando la tasa que ya traen guardada). El USD queda SOLO en el panel admin, que es para ti. |
| **«No se puede verificar el teléfono»** | Bug real de doble causa: (1) el código usaba `signInWithPhoneNumber`, que con sesión activa NO vincula el teléfono — arrancaba otra sesión o reventaba; ahora usa `linkWithPhoneNumber`, que vincula el número a TU cuenta. (2) El reCAPTCHA invisible se montaba dos veces y el segundo intento moría con «already rendered»; ahora el verificador se limpia y recrea en cada envío. Además: mensajes de error claros (teléfono ya vinculado, código vencido, demasiados intentos…), botón «Cambiar número / reenviar» y validación de 6 dígitos. |
| **«Antes de ver las métricas sale un aviso de error molesto»** | Bug real: la página de Métricas hacía `setError(true)` al montar, así que el panel de error se pintaba SIEMPRE y desaparecía solo cuando llegaban los datos. Ahora hay estado de carga (esqueleto) y el error solo aparece si la petición realmente falla. De paso: «Ventas 30 días» muestra su equivalente en Bs y se añadió el índice compuesto que la consulta de ventas necesita (status + createdAt ASC) para que nunca falle por índice faltante. |
| **«Falta incluir el rol de gerente»** | Rol **gerente** de punta a punta: backend (verifica pagos, mueve pedidos en todo el flujo, crea/edita catálogo y promos SIN borrar, ajusta stock, sube fotos, ve métricas y usuarios) y frontend (menú del panel filtrado, Usuarios en modo solo-lectura para gerente, descripción del rol al asignarlo). Queda reservado al admin: cambiar roles, cerrar sesiones, borrar cosas y Ajustes (cuentas de pago/IVA). |

Extras de blindaje incluidos en esta misma ronda (auditoría completa):

- **ENC_KEY_HEX obligatoria en producción**: la clave de respaldo del cifrado era derivable desde el repo público → sin clave real, las funciones FALLAN en Netlify con instrucción clara (paso 2 de este LEEME). En local sigue funcionando para pruebas.
- **Reglas de Firestore endurecidas**: `users` con lista blanca (antes el dueño podía sobrescribir `email`, `createdAt`, etc.) y `createdAtMs` congelado (insumo del antifraude — de paso se arregló que NUNCA se escribía: todas las órdenes salían con la bandera de «cuenta nueva»). `carts` valida cada ítem (antes un usuario podía inflar su carrito hasta 1 MB de basura). Gerente incluido en las reglas de catálogo.
- **Lecturas del checkout en lote** (`getAll`): la cotización pasa de hasta 100 lecturas secuenciales a 2 lotes — más rápido y mismo costo.
- **Timeout de 25 s** en el cliente de funciones: si una función no responde, la UI muestra error en vez de colgarse.
- **`.env.example` nuevo**: lista completa de variables para `netlify dev` y para Netlify.

---

## 1 · Instalación (reemplazo de archivos, 5 minutos)

1. Abre tu proyecto en VSC (`C:\Users\Erick\spot24`).
2. Copia el **contenido** de `spot24-ronda-3/` sobre la **raíz** del proyecto, reemplazando archivos cuando pregunte. Estructura interna idéntica a la del repo.
3. Archivos nuevos (no reemplazan nada): `.env.example` y `LEEME-RONDA-3.md`.
4. **No hay dependencias nuevas** (no hay que tocar package.json ni correr npm install).

## 2 · PASO CRÍTICO NUEVO — Clave de cifrado ENC_KEY_HEX

**Por qué**: los datos sensibles de cada orden (teléfono, cédula, dirección, referencia) se cifran con AES-256. La clave de respaldo que usaba el servidor cuando no hay `ENC_KEY_HEX` era derivable por cualquiera que lea el repo público. Ahora el servidor se niega a cifrar sin clave real en producción.

**Genera la clave UNA vez** (en la terminal de VSC, PowerShell):

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copia esa cadena de 64 caracteres. La vas a usar en el paso 3 y en el paso 5 — **debe ser EXACTAMENTE la misma en ambos lados**.

> ⚠️ Guarda esa cadena también en tu gestor de contraseñas. Si algún día la cambias, los campos cifrados de las órdenes anteriores ya no se podrán descifrar (las copias enmascaradas — teléfono ••••, referencia ••• — siguen visibles).

## 3 · Variables del `.env` local (para probar con netlify dev)

Abre `.env` en la raíz del proyecto (si no existe, crea una copia de `.env.example` renombrada a `.env`) y verifica que tenga TODAS estas líneas con valores. Netlify CLI **no** lee las variables del panel web: en local todo sale de este archivo.

```powershell
# Verifica línea por línea (las VITE_FIREBASE_* ya las tienes de las rondas anteriores):
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=
VITE_FCM_VAPID_KEY=...            # (opcional: notificaciones push)
FIREBASE_SERVICE_ACCOUNT=...      # JSON completo de la clave privada o su base64
ENC_KEY_HEX=<la clave del paso 2>
IMGBB_API_KEY=...                 # fotos de catálogo y comprobantes
BCV_RUN_KEY=...                   # disparo manual de la tasa BCV
```

Para añadir ENC_KEY_HEX al final del .env con PowerShell:

```powershell
Add-Content -Path .env -Value "ENC_KEY_HEX=PEGA_AQUI_LOS_64_CARACTERES"
```

## 4 · Publicar las reglas de Firestore (obligatorio para esta ronda)

Esta ronda cambia `firestore.rules` (gerente + lista blanca de users + validación de carts) y añade un índice compuesto. Hay dos caminos:

**Opción A — Firebase CLI (recomendado, gratis, no consume créditos de Netlify):**

```powershell
npm install -g firebase-tools     # si no lo tienes
firebase login
firebase deploy --only firestore:rules,firestore:indexes
```

- Salida esperada: `✔ Deploy complete!` con `firestore.rules` y `firestore.indexes`.
- El índice nuevo tarda unos minutos en construirse; no bloquea nada (la función de métricas funciona sin él, solo fallaría esa consulta si faltara — por eso es mejor crearlo ya).
- En el plan Spark esto es gratis. NO necesitas `firebase deploy --only functions` (tu backend corre en Netlify).

**Opción B — Consola (solo reglas, sin CLI):**

1. Firebase Console → tu proyecto → **Firestore Database** → pestaña **Reglas**.
2. Abre `firestore.rules` del paquete, copia TODO el contenido, pégalo en el editor y pulsa **Publicar**.
3. El índice compuesto: si algún día una consulta lo pide, Firestore devuelve un error con un **enlace directo para crearlo** con un clic (también lo tienes declarado en `firestore.indexes.json` para el camino CLI).

> El archivo `storage.rules` también cambió (gerente puede subir fotos de catálogo), pero en tu plan Spark no hay bucket de Storage: si no tienes Storage activo, sáltalo — se aplicará cuando algún día actives Blaze.

## 5 · Variables en Netlify (producción)

app.netlify.com → tu sitio → **Site configuration → Environment variables**. Verifica/añade:

| Variable | Valor | Nota |
|---|---|---|
| `VITE_FIREBASE_*` (6) | las de siempre | ya deben existir |
| `VITE_FCM_VAPID_KEY` | la de siempre | opcional |
| `FIREBASE_SERVICE_ACCOUNT` | JSON de la clave privada | ya debe existir |
| **`ENC_KEY_HEX`** | **la clave del paso 2** | **NUEVA — obligatoria** |
| `IMGBB_API_KEY` | la de siempre | |
| `BCV_RUN_KEY` | la de siempre | |
| `ADMIN_SETUP_KEY` | — | **ELIMÍNALA si ya hiciste el bootstrap** del primer admin |
| `APPCHECK_ENFORCE` | no crear aún | se activará en una fase posterior |

Tras guardar `ENC_KEY_HEX`, el redeploy que harás en el paso 8 la incorpora.

## 6 · Probar TODO en desarrollo (0 créditos)

```powershell
npm install          # solo si cambiaste de máquina
npm --prefix functions ci
npx netlify-cli dev
```

Abre `http://localhost:8888`. Checklist de esta ronda:

**Precios solo en Bs (con cualquier usuario):**
- [ ] Catálogo y ficha de producto: precios en Bs (rojo), cero US$ en pantalla
- [ ] Carrito: subtotal en Bs + tasa BCV visible; ya no hay «$» ni «Subtotal referencial»
- [ ] Checkout → elegir zona: el envío de cada zona aparece en Bs
- [ ] Checkout → Pago: Subtotal/Envío/IVA/Total todo en Bs; texto «Monto oficial calculado por el servidor»
- [ ] Confirmación y «Ver mi pedido»: líneas, totales y total final en Bs
- [ ] Panel admin SÍ conserva USD (pagos, métricas) — es interno, correcto

**Teléfono (Mi cuenta → Verificar teléfono):**
- [ ] Pide el código con un número 04xx real → llega el SMS
- [ ] Código correcto → recarga y en «Mi cuenta» aparece el teléfono (+58…)
- [ ] Prueba también un código malo → mensaje claro «Código incorrecto…» (sin romper nada)

> ⚠️ IMPORTANTE sobre SMS reales: Firebase cobra los SMS de teléfono. En plan **Spark** los SMS reales pueden fallar con «quota exceeded». Dos salidas: (a) activar Blaze solo si quieres SMS en producción, o (b) Firebase Console → Authentication → Sign-in method → Phone → **Phone numbers for testing** — registras tu número y un código fijo (ej. 123456) y la verificación funciona gratis e ilimitada para ti. Para probar el flujo HOY, usa (b) también en local.
> Además verifica en Authentication → Settings → **Authorized domains** que estén `localhost` y tu dominio de Netlify.

**Métricas (panel → Métricas):**
- [ ] Al entrar: esqueleto de carga y luego los datos — SIN panel de error
- [ ] «Ventas 30 días» muestra USD y su equivalente en Bs
- [ ] (En local `fn-getAdminMetrics` sí corre con netlify dev — si diera error, revisa que `FIREBASE_SERVICE_ACCOUNT` esté en el `.env`)

**Rol gerente:**
- [ ] Entra como admin → Usuarios → cambia a alguien (o regístrate con otro correo) a **Gerente**
- [ ] Esa persona cierra sesión y vuelve a entrar → entra a `/admin`
- [ ] Ve: Pagos, Despacho, Productos, Categorías, Zonas, Usuarios, Métricas, Promos — NO «Ajustes»
- [ ] En Usuarios ve la lista pero con «Solo lectura» (sin cambiar roles)
- [ ] En Productos puede crear/editar; no aparece borrado (y el backend lo rechazaría igual)

**Regresión rápida (que nada se rompió):**
- [ ] Agregar al carrito desde tarjeta y ficha; cantidades
- [ ] Confirmar un pedido de prueba en local (crea orden real en tu Firestore: cancélala luego desde Pagos)
- [ ] Subir comprobante desde «Ver mi pedido»
- [ ] Fotos de producto/categoría/promo desde el panel
- [ ] Tasa BCV manual: `http://localhost:8888/.netlify/functions/fn-runBcvRate?key=TU_BCV_RUN_KEY`

## 7 · Subir los cambios a GitHub (aún no gastas créditos)

```powershell
git add .
git commit -m "Ronda 3: solo Bs en cliente, fix telefono, fix metricas, rol gerente, hardening"
git push
```

> Si tocaste SOLO archivos de reglas/documentación el build se cancela solo (regla `ignore` del netlify.toml). Aquí hay código, así que el push de arriba dispara el deploy normal — hazlo cuando el checklist del paso 6 esté verde.

## 8 · Deploy a producción (cuando todo esté aprobado)

1. Verifica el paso 5 (ENC_KEY_HEX en Netlify) ANTES de hacer push, o el primer pedido dará «ENC_KEY_HEX no configurada».
2. `git push` (paso 7) → Netlify construye frontend + funciones: **1 deploy = 15 créditos**.
3. Post-deploy en producción:
   - [ ] La tienda carga y muestra precios en Bs
   - [ ] Crea el pedido de prueba final desde tu teléfono (y cáncelalo)
   - [ ] Panel → Usuarios: asigna Gerente a tu persona de confianza real
   - [ ] Métricas cargan sin error

## 9 · Fases posteriores (opcional, cuando quieras)

- **App Check (anti-bots)**: registrar reCAPTCHA v3 en Firebase → App Check, añadir `VITE_RECAPTCHA_V3_SITE_KEY`, dejarlo en monitoreo unos días y luego `APPCHECK_ENFORCE=true` (para local, `VITE_APPCHECK_DEBUG_TOKEN`). Cuando lo decidas, te preparo la ronda con el paso a paso.
- **TTL de contadores**: los docs temporales de `counters/` e `idempotency/` caducan solos con una política TTL (`gcloud firestore fields ttl update expireAt --collection-group=counters`). Opcional; el volumen actual no lo exige.

## 10 · Si algo falla (troubleshooting)

| Síntoma | Causa probable | Arreglo |
|---|---|---|
| Cualquier función responde 400 «ENC_KEY_HEX no configurada» | Falta la variable en Netlify (o en `.env` para local) | Pasos 3 y 5 → guardar → redeploy |
| Al confirmar pedido: «failed-precondition» | Índice compuesto recién creado aún construyéndose, o reglas sin publicar | Espera 5 min / repite paso 4 |
| SMS del teléfono no llega / error de cuota | Plan Spark sin SMS reales | Números de prueba en Authentication → Phone (paso 6) |
| «Este dominio no está autorizado…» | Dominio fuera de Authorized domains | Firebase Console → Authentication → Settings → añadir dominio |
| Métricas da error en producción | Falta `FIREBASE_SERVICE_ACCOUNT` en Netlify o índice sin crear | Revisar variables y paso 4 |
| Gerente no ve el nuevo menú | Cambió el rol pero no cerró sesión | Cerrar sesión y volver a entrar |
| «Bs. —» en precios | Tasa BCV sin publicar todavía | Dispara manual: fn-runBcvRate con tu clave (paso 6) |
