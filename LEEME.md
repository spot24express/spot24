# SPOT 24 · Ronda 2 — Checkout pulido + comprobante de pago + GPS obligatorio

**20 archivos** · Validado antes de empaquetar: typecheck frontend ✓ · typecheck netlify ✓ · typecheck functions ✓ · 27/27 tests ✓ · 8/8 tests backend ✓ · build PWA ✓

Requiere haber instalado antes el paquete anterior (spot24-fase-a).

---

## ⚠️ Respuestas a tus dos preguntas primero

**1) «Calculando montos en el servidor…» y «Algo salió fuera de línea…» al confirmar — ¿es por desarrollo?**
**SÍ.** El comando `npm run dev` (Vite) NO ejecuta las Netlify Functions: el catálogo y la UI funcionan (leen Firestore directo), pero las funciones de servidor (cotizar, crear orden, subir comprobante) no existen en `localhost:3000`. Por eso los montos quedan colgados y confirmar falla.

**La forma correcta de probar todo el flujo en local:**

```bash
npm install
npm --prefix functions ci     # dependencias que las funciones resuelven al bundlear
npx netlify-cli dev           # ejecuta Vite + las funciones juntas (puerto 8888)
```

Abre `http://localhost:8888`. Si no tienes el CLI: `npm install -g netlify-cli`.

> **OJO**: en local las funciones usan tu Firebase de producción (las variables de entorno apuntan allá). Las órdenes de prueba que crees son REALES: cancélalas desde el panel admin al terminar, o prueba solo la lectura de montos.

**2) ¿El cliente puede subir el comprobante de pago?**
**Ahora sí.** El flujo ya estaba diseñado a medias (bloqueado por Storage, que tu plan Spark no tiene). Lo migré a **imgbb** — el mismo mecanismo de las fotos de productos — y funciona de punta a punta:
- Tras confirmar, en «Mis pedidos» → detalle del pedido aparece **«Subir comprobante»** (JPG/PNG/WebP, se comprime solo).
- Queda guardado en la orden (`payment.receiptUrl`) y tú lo ves **directo en la cola de verificación** (`/admin/pagos`) con un clic.
- Usa la misma variable de entorno `IMGBB_API_KEY` que ya tienes en Netlify (la de las fotos del admin).

---

## Qué se hizo con cada punto que pediste

| Pediste | Se hizo |
|---|---|
| Cédula sin V-/E- incómoda | Ahora acepta **solo números** (también con puntos). Si escribes V- o E-, se respeta. Corregido en cliente **y en el servidor** (el backend también exigía el prefijo — sin este fix la orden rebotaría) |
| Teléfono no admite 0422 | **Bug real**: faltaba 0422 en la lista. Ahora los 6 prefijos móviles: 0412, 0414, 0416, **0422**, 0424, 0426. Acepta 0424-123-4567, 4241234567, etc. |
| Quitar Estado y Ciudad | Eliminados del formulario. El servidor fija **Aragua / Maracay** automáticamente |
| Ubicación no opcional | **GPS obligatorio en delivery**: botón «Capturar mi ubicación», bloquea avanzar sin ella, se guarda en la orden y el admin/despacho ve **«Abrir ubicación GPS del cliente»** (Google Maps). En retiro en tienda **no aparece** |
| «Ventana» → Horario | Ahora dice **«Horario de entregas: …»** |
| «Único método» | Eliminado. El contrato ya soporta sumar métodos sin tocar la UI |
| Referencia = últimos 6 dígitos | Validación **exactamente 6 dígitos**, campo limitado a 6 caracteres, etiqueta «Referencia (últimos 6 dígitos)» |
| Todos los bancos | Lista verificada contra SUDEBAN: **26 bancos activos** (Banesco, BDV, Mercantil, Provincial, BNC, Exterior, Tesoro, Bicentenario, Bancaribe, Fondo Común, Caroní, Activo, Bancamiga, Banplus, Plaza, Sofitasa, BVC, Bancrecer, Bangente, Banfanb, BOD, DelSur, 100% Banco, BID, N58, R4). Descartados: **«Banco Platino» no existe** (estaba en tu lista) y bancos cerrados/fusionados. BOD se mantiene durante su migración a BNC |
| Montos colgados | Si el servidor no responde ahora ves **error + botón «Reintentar»** y el botón «Revisar y confirmar» se bloquea hasta tener montos (en producción no pasa, en dev te ahorra confusión) |
| Comprobante | Implementado de punta a punta (ver arriba) |
| Revisar subidas de imágenes | Auditado: **Productos, Categorías y Promos** usan la misma vía (admin → imgbb) y funcionan; extraje la compresión a una librería compartida (`imageCompress.ts`) que ahora usan el admin Y el cliente |

---

## Contenido del paquete

| Archivo | Estado | Qué cambia |
|---|---|---|
| `src/shared/lib/validation.ts` | ACTUALIZADO | Cédula sin prefijo obligatorio, teléfono +0422, referencia exactamente 6 dígitos |
| `src/tests/validation.test.ts` | ACTUALIZADO | Tests de los nuevos validadores |
| `src/shared/constants/brand.ts` | ACTUALIZADO | VE_BANKS: 26 bancos reales (SUDEBAN), fuera Platino y fantasmas |
| `src/shared/constants/orders.ts` | ACTUALIZADO | Instrucciones de pago con «últimos 6 dígitos» y «Ver mi pedido» |
| `src/shared/types/index.ts` | ACTUALIZADO | `AddressData.location` (GPS) |
| `src/features/orders/types/index.ts` | ACTUALIZADO | `payment.receiptUrl`, `delivery.location`, eventos del cliente |
| `src/shared/lib/imageCompress.ts` | **NUEVO** | Compresión de imágenes compartida (admin + cliente) |
| `src/features/admin/services/imageUpload.service.ts` | ACTUALIZADO | Usa la librería compartida (mismo comportamiento) |
| `src/features/orders/services/orders.service.ts` | ACTUALIZADO | `uploadReceipt` vía fn-uploadReceipt → imgbb (sin Storage) |
| `src/features/checkout/pages/CheckoutPage.tsx` | ACTUALIZADO | Todos los cambios del checkout (datos, entrega, GPS, pago, montos) · **Montos ahora en Bs. como moneda principal** (tasa BCV visible, respaldo USD si no hay tasa) en Pagos, Revisión y Confirmación |
| `src/features/orders/pages/OrderDetailPage.tsx` | ACTUALIZADO | Subir/ver comprobante, «Horario de entrega», link GPS |
| `src/features/admin/pages/AdminPaymentsPage.tsx` | ACTUALIZADO | Ve el comprobante real (imagen) en la cola de verificación |
| `src/features/admin/pages/AdminDispatchPage.tsx` | ACTUALIZADO | «Abrir ubicación GPS del cliente» por orden |
| `src/features/admin/pages/AdminZonesPage.tsx` | ACTUALIZADO | FIX: al editar una zona, el formulario ahora **precarga sus datos** (antes abría vacío). Estado por defecto: Aragua |
| `src/features/checkout/pages/CheckoutSuccessPage.tsx` | ACTUALIZADO | Aviso «sube tu comprobante desde Ver mi pedido» |
| `functions/src/orders.ts` | ACTUALIZADO | Cédula sin prefijo en servidor, GPS en la orden, `coreUploadReceipt` |
| `netlify/functions/fn-uploadReceipt.ts` | **NUEVO** | Endpoint del comprobante (sesión + propiedad de la orden) |
| `vite.config.ts` | ACTUALIZADO | La CSP de desarrollo ahora permite los dominios de Firebase Auth (apis.google.com, gstatic, recaptcha, iframe de auth). Sin este fix, la consola bloquea `apis.google.com/js/api.js` al cargar la app y el login por teléfono fallaría en dev. Producción (netlify.toml) no cambia: ya los tenía |
| `netlify.toml` | ACTUALIZADO | Nuevo bloque `[dev]`: le dice a `netlify dev` que tu Vite corre en el puerto 3000 (sin él, el CLI espera el 5173 por defecto y expira con «Timed out waiting for port '5173'»). **Producción no cambia: el bloque `[dev]` lo ignoran los builds de Netlify** |

---

## Instalación (2 minutos)

1. Abre tu proyecto en VSC.
2. Copia el **contenido** de `spot24-checkout-v2/` sobre la **raíz** del proyecto, reemplazando archivos.
3. No hay dependencias nuevas ni cambios de reglas de Firestore. Sí cambian `vite.config.ts` y `netlify.toml` (solo afectan desarrollo local; producción queda igual).
4. **Reinicia el servidor dev** (detén `netlify dev` y vuélvelo a levantar) para que la nueva CSP de `vite.config.ts` entre en vigor. El error de consola «violates the following Content Security Policy directive… apis.google.com» debe desaparecer.

## Probar en desarrollo (con funciones)

```bash
npm install
npm --prefix functions ci
npx netlify-cli dev
```

> **Si TODAS las funciones dan 500 «internal»** (en consola: «fn-quoteTotals falló internal»), falta la credencial del servidor:
> 1. Firebase Console → ⚙️ Configuración del proyecto → **Cuentas de servicio** → **Generar nueva clave privada** (descarga un JSON del MISMO proyecto que tu app).
> 2. Conviértela a base64 y añádela a tu `.env` (no se sube a GitHub, está en .gitignore):
>    ```powershell
>    $b64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes((Get-Content -Raw "$env:USERPROFILE\Downloads\EL-NOMBRE-DE-TU-ARCHIVO.json")))
>    Add-Content -Path .env -Value "`nFIREBASE_SERVICE_ACCOUNT=$b64"
>    ```
> 3. Reinicia `netlify dev`. Para producción, la misma variable se añadirá en Netlify → Site configuration → Environment variables (solo cuando toquemos el deploy).

> **Si subiendo fotos dice «IMGBB_API_KEY no configurada»** (o la tasa manual dice «Configura BCV_RUN_KEY»): `netlify dev` no pasa las variables del panel de Netlify al runtime de las funciones — solo las del `.env`. Añádelas también ahí (los valores están en app.netlify.com → tu sitio → Site configuration → Environment variables):
> ```powershell
> Add-Content -Path "C:\Users\Erick\spot24\.env" -Value "IMGBB_API_KEY=PEGA_AQUI_LA_CLAVE"
> Add-Content -Path "C:\Users\Erick\spot24\.env" -Value "BCV_RUN_KEY=PEGA_AQUI_LA_OTRA"
> ```
> Luego reinicia `netlify dev`. Esto habilita: fotos de Productos/Categorías/Promos, comprobantes del cliente y el disparo manual de la tasa.

**Tasa BCV en dev**: el cron automático NO corre en local (solo en producción, cada 3 h). Para cargar la tasa ahora mismo, abre en el navegador:

`http://localhost:8888/.netlify/functions/fn-runBcvRate?key=TU_BCV_RUN_KEY`

Responde un JSON con la tasa y la guarda; la PWA la muestra al instante. (En producción la tasa existe pero está detenida desde el 30/09 porque el fix TLS del BCV aún no se despliega — se arregla con el próximo deploy.)

Checklist en `http://localhost:8888`:

- [ ] **Datos**: cédula SOLO números (12345678) acepta; teléfono 0422… acepta
- [ ] **Entrega delivery**: ya NO pide estado ni ciudad; **exige GPS** (prueba avanzar sin capturar → error); «Horario de entregas» visible
- [ ] **Entrega retiro**: sin GPS, sin dirección, con tu dirección del local
- [ ] **Pago**: 26 bancos en el selector; referencia con exactamente 6 dígitos; sin «Único método»; cédula del pagador solo números
- [ ] **Montos**: cargan solos con las funciones corriendo (si fallan, botón Reintentar)
- [ ] **Confirmar pedido**: se crea sin el error de antes (las funciones SÍ responden con netlify dev)
- [ ] **Mi pedido → Subir comprobante**: sube una captura → aparece «Ver comprobante subido»
- [ ] **/admin/pagos → Revisar**: la imagen del comprobante visible; /admin/despacho: link GPS
- [ ] **Imágenes admin**: sube/edita foto en productos, categorías y promos → todo funciona igual

## Deploy

Solo cuando todo esté aprobado en dev: **1 deploy Netlify = 15 créditos** (frontend + funciones juntas, incluida la nueva `fn-uploadReceipt`). No hace falta `firebase deploy`. Sigues en **0 de 140** hasta ese momento.
