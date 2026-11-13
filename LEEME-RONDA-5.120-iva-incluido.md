# LEEME · Ronda 5.120 — IVA INCLUIDO en el precio publicado (modelo B1)

## El modelo que quedó implementado

- El `priceUsd` de cada variante es el **precio FINAL que paga el cliente**.
  El IVA **no se suma encima**: el servidor lo **extrae** del monto ya
  convertido a bolívares (regla extractor: `Base imponible + IVA = precio`).
- El **envío es partida neutra**: entra al total tal cual, **sin IVA**
  (la base y el IVA salen SOLO de los productos).
- **Cambiar el % en Ajustes NO cambia lo que paga el cliente**: solo cambia
  el reparto base/IVA (la diferencia la absorbe la tienda, no el comprador).
- **IVA 0 = sin desglose**: la fila de IVA desaparece de todas las pantallas
  y el total es idéntico al modelo anterior. Nada se rompe.
- Los **pedidos viejos no se reescriben**: cada orden conserva su desglose
  congelado. En las órdenes anteriores el subtotal YA era la base (el IVA se
  sumaba encima), así que el desglose "Base imponible + Envío + IVA = Total"
  sigue cuadrando con ellas sin migración.

## Archivos a reemplazar (7) — completos, listos para copiar

| # | Archivo de la carpeta | Copiar en |
|---|---|---|
| 1 | `orders.ts` | `functions/src/orders.ts` |
| 2 | `checkout-types-index.ts` | `src/features/checkout/types/index.ts` |
| 3 | `CheckoutPage.tsx` | `src/features/checkout/pages/CheckoutPage.tsx` |
| 4 | `OrderDetailPage.tsx` | `src/features/orders/pages/OrderDetailPage.tsx` |
| 5 | `AdminPaymentsPage.tsx` | `src/features/admin/pages/AdminPaymentsPage.tsx` |
| 6 | `AdminSettingsPage.tsx` | `src/features/admin/pages/AdminSettingsPage.tsx` |
| 7 | `orders-iva-incluido.test.ts` | `functions/src/__tests__/orders-iva-incluido.test.ts` (ARCHIVO NUEVO) |

Los 6 primeros son TU versión actual de VSC (la que me pegaste) con los
cambios de B1 encima. Nada de tu trabajo pendiente se perdió: solo se tocaron
los puntos del IVA y las etiquetas.

## Qué cambió exactamente

1. **`functions/src/orders.ts`** (el corazón):
   - `computeTotals`: extracción del IVA sobre el monto en Bs (moneda del
     cobro), regla extractor, envío neutro, y campo nuevo `baseVes`.
   - `baseVes` ahora viaja en la cotización (fn-quoteTotals), se guarda
     congelado en la orden y vuelve en la respuesta de createOrder
     (buildCreateResponse — con fallback 0 para replays de órdenes viejas).
   - Comentario de cabecera actualizado (IVA incluido, envío sin IVA).
2. **`checkout/types/index.ts`**: `OrderTotals.baseVes?: number` + comentarios.
3. **`CheckoutPage.tsx`**: en "Montos" la fila dice **"Base imponible"** y
   muestra `baseVes` (con caída a subtotalVes por seguridad).
4. **`OrderDetailPage.tsx`**: fila "Base imponible" en Totales.
5. **`AdminPaymentsPage.tsx`**: fila "Base imponible" en el Desglose de la
   modal de verificación.
6. **`AdminSettingsPage.tsx`**: campo "IVA (%) incluido en los precios — 0
   para desactivado" y texto de ayuda actualizado.
7. **`orders-iva-incluido.test.ts`** (NUEVO, guardián): 4 tests que fijan el
   modelo — extracción 16%, cambio de % no cambia el total, IVA 0 idéntico al
   anterior, envío neutro.

## Verificación (en sandbox, contra TUS archivos)

- `functions`: **58 tests pass** + 14 skipped (emulador, por diseño) — los 8
  guardianes BDV (5.113) y los 4 nuevos de IVA quedaron verdes.
- `tsc`: 0 errores en web y functions.
- Web: **252 tests pass** (21 archivos) y build PWA OK.

⚠ En tu máquina la suite es más grande (391 web): corre `npm test` local.
Los archivos que mi sandbox no tenía (imgbb, imagen-respaldo, pagoMovilAuto,
destinatario, notifications, orders/types, settings.service…) NO están en
esta carpeta: los tuyos mandan y no hay que tocarlos.

## Números de humo con tus datos (Toronto $1 · IVA 16% · tasa 901,62)

**Retiro en tienda:**
```
Base imponible      Bs 777,26
Envío               Retiro en tienda · Gratis
IVA (16%)           Bs 124,36
Total a pagar       Bs 901,62     ← el precio publicado
```

**Envío a domicilio (zona con fee $1,00):**
```
Base imponible      Bs 777,26
Envío               Bs 901,62
IVA (16%)           Bs 124,36
Total a pagar       Bs 1.803,24   ← $1,00 + $1,00 × 901,62
```

El cliente copia `901,62` (o `1803,24`) en su pago móvil, igual que siempre.

## Pasos después de copiar

1. `npm test` (web) y dentro de `functions/` el suite de vitest — todo verde.
2. `netlify dev` y humo: Toronto al carrito → checkout → verificá las cifras
   de arriba; prueba también con otra zona y con IVA en 0 (la fila desaparece).
3. Deploy normal del sitio (push → Netlify). Si además tienes Cloud Functions
   de Firebase desplegadas, corre también `firebase deploy --only functions`.
4. Deja el **IVA en 16 en Ajustes**: con esta ronda activa ese % significa
   "IVA ya incluido en mis precios".

Sugerencia de mensaje de commit:
`Ronda 5.120 (B1): IVA incluido en el precio publicado + desglose Base imponible · envío sin IVA + guardián`
