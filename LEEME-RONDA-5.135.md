# LEEME · Ronda 5.135 — «ENVIAR A OTRA PERSONA O UBICACIÓN»

**Base:** `1c2f242` (rondas 5.124–5.132). Aplicable **encima** de tu ronda 5.134 local sin commitear: **cero solapamiento de archivos** (5.134 toca compartir/whatsapp/settings/RootLayout/AdminSettingsPage/shareImage; 5.135 toca checkout/orders/despacho).
**Qué resuelve:** hoy el cliente da SU GPS y el delivery llega exacto a donde él está. Con esta ronda el comprador puede pagar un pedido y mandarlo a **otra persona y otra dirección** (regalo, encargo para un familiar, compra para llevar a alguien): el pedido llega con el nombre de quien recibe, su teléfono y el punto exacto de SU casa.

**Las 3 decisiones aprobadas (fijadas en código y tests):**
1. **La tarifa se cobra con la zona del DESTINATARIO** — el mensajero viaja adonde va el paquete. Mismo desplegable de zonas de siempre; cero zonas nuevas.
2. **El teléfono del destinatario va EN CLARO para cajera y mensajero** — mismo criterio que el del comprador desde la 5.9. Sin teléfono visible, la entrega se cae.
3. **El pagador y el antifraude no se tocan** — `contact` sigue siendo el comprador (nombre, cédula, teléfono, su método de pago). El destinatario no paga, no da cédula, no crea cuenta.

**Sin colecciones, índices ni reglas Firestore nuevas.** Todo usa el patrón `undefined → fallback`: las órdenes viejas y las compras normales no traen los campos nuevos y se comportan **exactamente igual que hoy**.

---

## 1 · Los 12 archivos (3 nuevos + 9 modificados)

### NUEVOS (se copian tal cual)

| Archivo | Qué es |
|---|---|
| `src/features/checkout/lib/destinatario.ts` | Libra pura del destinatario: formulario (`EntregaTerceroForm`), validadores y `parsearUbicacionTexto()` — convierte el enlace/coordenadas de Google Maps que la persona compartió por WhatsApp en el mismo `{lat,lng}` que captura el GPS. |
| `src/tests/destinatario.test.ts` | Tests de la libra (14): enlaces `?q=`, `/@`, `!3d!4d`, `geo:`, coordenadas peladas, casos imposibles; validación de los 5 campos; saneo del payload. |
| `functions/src/__tests__/entrega-terceros.test.ts` | Tests del backend (14): pickup+tercero **rechazado**, `undefined → null`, saneo nombre/teléfono, preview `Para: …`, aviso interno con `Para:`. |

### MODIFICADOS (se reemplazan completos — parten de 1c2f242)

| Archivo | Cambio |
|---|---|
| `src/features/checkout/types/index.ts` | `DestinatarioData {nombre, telefono}` + `CreateOrderPayload.entregaTercero?`. |
| `src/features/checkout/pages/CheckoutPage.tsx` | Suiche «**Enviar a otra persona**» (solo delivery). Encendido: nombre/teléfono/zona/dirección/punto del destinatario **sustituyen** a los campos del comprador; la cotización usa la zona del destinatario; el GPS del punto se llena con el botón (si el comprador está allí) o pegando el enlace que le mandaron; la revisión final muestra «Recibe:». |
| `src/features/orders/types/index.ts` | `Destinatario` + `Order.envioTercero?` / `Order.destinatario?`. |
| `functions/src/orders.ts` | `parseEntregaTercero`: undefined→null, **pickup+tercero rechaza**, tercero sin GPS rechaza; `computeTotals` cobra la zona de `address` (que ES la del destinatario); `addressPreview` = `Para: {nombre} · {ciudad} · {detalles}`; el doc guarda `envioTercero: true` + `destinatario {nombre, telefono}` en claro; evento inicial anota «Entrega a: X». Contacto/pagos/antifraude intactos. |
| `functions/src/lib/notifications.ts` | `cuerpoAvisoStaff()`: los avisos internos del personal («Pago por verificar» / «Pedido pagado») llevan `Para: {nombre}.` cuando aplica. **Único aviso que cambia**: al destinatario jamás se le notifica; el comprador recibe sus globos de siempre. |
| `src/features/admin/pages/AdminDispatchPage.tsx` | Fila **`Recibe: {nombre} · {teléfono}`** con enlace **«WhatsApp al destinatario»** (wa.me con mensaje prellenado) en la cola activa y en Entregadas; el enlace GPS ahora dice «Abrir **punto de entrega** en Google Maps». |
| `src/features/orders/pages/OrderDetailPage.tsx` | Fila «Recibe» + «Teléfono de quien recibe» en la sección Entrega (solo si la orden trae destinatario). |
| `src/tests/matriz-push-5114.test.ts` | **Guardián 5.114 actualizado**: vigilaba el texto `sendPaidAlert(code)` en orders.ts; ahora vigila `sendPaidAlert(code, paraQuien)` (la firma nueva). Lo que cuida (orden de la cadena, ramas) queda intacto. |
| `src/tests/respaldo-imagenes-5115.test.ts` | **Guardián 5.115 actualizado**: mismo ajuste de firma en su regresión del aviso al cajero. |
| `functions/src/__tests__/orders-pago-bdv.test.ts` | **Test 5.113 actualizado**: el mock de los avisos ahora espera el 2º parámetro opcional `(code, undefined)` en compras normales. |

Los 3 últimos NO son lógica nueva: son los guardianes de rondas anteriores que inspeccionan el texto fuente de `orders.ts` y exigían la firma vieja de los avisos. Sin ese ajuste, la suite marca rojo aunque el sistema esté bien.

**Diseño clave (por qué no se rompe nada):** en modo tercero, el checkout envía en `address` **la dirección del destinatario** (misma estructura de siempre) y en `entregaTercero` solo `{nombre, telefono}`. Así el backend reutiliza todo su pipeline: cifrado de dirección, tarifa por zona, candado de franja 5.112-B, GPS al mensajero. Lo único nuevo es «quién recibe».

**El punto exacto (GPS):** el comprador casi nunca está parado en la casa de quien recibe, por eso hay DOS vías: el botón de GPS (si está allí) o pegar el enlace/coordenadas que el destinatario comparte por WhatsApp («ubicación» → adjunto con `?q=lat,lng`). Los enlaces cortos `maps.app.goo.gl` no traen coordenadas: la UI lo avisa.

---

## 2 · Cómo aplicarla en tu VSC

```bash
# 0) Con tu repo abierto y la 5.134 aún sin commitear (no chocan):
#    se recomienda cerrar antes la 5.134 (commit + push) y luego aplicar esta ronda.
# 1) Copiar el árbol ronda-5.135/ sobre la raíz del repo (se sobreescriben los 6 modificados):
#      cp -r ronda-5.135/src/* src/
#      cp -r ronda-5.135/functions/src/* functions/src/
#    (o arrastrar las carpetas en VSC: src/ y functions/src/)
# 2) Revisar en VSC: los cambios quedan marcados en verde/rojo archivo por archivo.
```

Contenido exacto de la ronda:
```
ronda-5.135/
├── src/features/checkout/lib/destinatario.ts          (NUEVO)
├── src/features/checkout/pages/CheckoutPage.tsx       (MOD)
├── src/features/checkout/types/index.ts               (MOD)
├── src/features/orders/pages/OrderDetailPage.tsx      (MOD)
├── src/features/orders/types/index.ts                 (MOD)
├── src/features/admin/pages/AdminDispatchPage.tsx     (MOD)
├── src/tests/destinatario.test.ts                     (NUEVO)
├── src/tests/matriz-push-5114.test.ts                 (MOD · guardián)
├── src/tests/respaldo-imagenes-5115.test.ts           (MOD · guardián)
├── functions/src/orders.ts                            (MOD)
├── functions/src/lib/notifications.ts                 (MOD)
├── functions/src/__tests__/entrega-terceros.test.ts   (NUEVO)
├── functions/src/__tests__/orders-pago-bdv.test.ts    (MOD · guardián)
└── LEEME-RONDA-5.135.md                               (NUEVO)
```

## 3 · Prueba local (todo verde antes de subir)

Estado verificado con esta ronda aplicada sobre `1c2f242` limpio: `tsc --noEmit` OK (front y functions), **suite frontend 387/387** y **suite functions 145/145** (14 skips ya existían).

```bash
# Frontend: tipos + TODA la suite (las 5.134 incluidas)
npm run typecheck
npm test

# Backend (functions): build + tests
cd functions
npm run build
npm test
cd ..
```

Criterios de salida: `typecheck` sin errores; `npm test` (raíz) en verde incl. `src/tests/destinatario.test.ts`; `npm test` (functions) en verde incl. `entrega-terceros.test.ts`; `build` de functions sin errores.

Prueba manual rápida (opcional, `npm run dev`): carrito con algo → checkout → paso Entrega → «Envío a domicilio» → aparece el suiche **Enviar a otra persona** → al encenderlo cambian los campos → sin llenar nada, «Seguir al pago» no avanza (5 errores visibles) → llenar con tu segundo teléfono y pegar `https://maps.google.com/?q=10.2546,-67.5912` → «Usar esa ubicación» → avanzar y revisar que en «Revisión final» aparezca **Recibe: …**.

## 4 · Commit y push ÚNICO

```bash
git add -A
git commit -m "Ronda 5.135: enviar a otra persona o ubicación (destinatario + tarifa por su zona + Recibe en despacho)"
git push origin main
```

(si aplicaste 5.134 antes, ya estará en otro commit — dos commits limpios, uno por ronda).

## 5 · Deploy

1. **Netlify** (PWA): se despliega solo con el push. Espera el «Published».
2. **Cloud Functions** (obligatorio: cambian `orders.ts` y `notifications.ts`):
   ```bash
   firebase deploy --only functions
   ```
   (o `npm run deploy:firebase` desde la raíz, que además sube rules/indexes ya existentes).

## 6 · Checklist post-deploy (en producción, 10 minutos)

**A. Compra normal INTACTA (lo primero):** compra de prueba SIN tocar el suiche → todo igual que siempre (tarifa de tu zona, panel sin «Recibe», sin «Para:»).

**B. Retiro INTACTO:** pedido pickup → sigue sin dirección ni GPS ni tercero.

**C. Envío a otra persona (el nuevo camino):**
- [ ] Suiche encendido → cotización con la zona del destinatario (elige una zona de tarifa distinta y verifica el monto de envío en «Montos»).
- [ ] Pago móvi/transferencia normal del comprador (antifraude igual: cédula del pagador, su teléfono).
- [ ] Tu cajero ve en «Pago por verificar» (o «Pedido pagado») el cuerpo con **« Para: {nombre}.»**
- [ ] Despacho: la tarjeta muestra **Recibe: {nombre} · {tel}** + «WhatsApp al destinatario» + «Abrir punto de entrega en Google Maps» apuntando al punto pegado.
- [ ] El cliente ve en «Ver mi pedido»: sección Entrega con Zona del destinatario, Dirección «Para: …», y filas Recibe / Teléfono de quien recibe.
- [ ] Entrega real: el mensajero llama al destinatario (no al pagador) y culmina «→ Entregado» normal.

**D. Órdenes viejas:** abre cualquier pedido anterior en el panel y en «Mis pedidos» → sin «Recibe», sin «Para:», nada diferente.

**Rollback simple:** la ronda es aditiva; `git revert <commit>` + redeploy + `firebase deploy --only functions` vuelve al comportamiento exacto anterior (los campos nuevos en órdenes creadas durante la ronda quedan inofensivos: nadie los lee si el código no los conoce).

## 7 · Pendientes que esta ronda NO toca (para después)

- Radar de despacho (3 opciones del dueño), limpieza de pedidos de prueba, CARGADOR IPHONE (imagen rota), verificación en producción del push 5.133/5.134.
- Mejora futura posible: aviso por WhatsApp directo al destinatario al salir en ruta (hoy solo el panel lleva el enlace; el mensajero lo pulsa).
