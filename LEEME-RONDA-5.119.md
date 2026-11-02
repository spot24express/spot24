# RONDA 5.119 · El IVA se calcula sobre la base EN BOLÍVARES

**Fecha:** 02/11/2026 · **Estado:** aplicada y validada por el dueño — lista para push a `main`
**Archivo tocado:** `functions/src/orders.ts` (solo `computeTotals` — único punto de cálculo del backend)

## El problema (detectado por el dueño en pruebas con precio 0,01)
Con un producto de prueba a 0,01 USD el IVA salía **0,00**. Con precios normales,
además, el IVA cobrado en Bs se desviaba del real por doble redondeo.

## Causa
La fórmula anterior redondeaba el IVA **en USD** (2 decimales) y LUEGO convertía a Bs:
- `ivaUsd = round2((subtotal + envío) × %)` ← el redondeo mataba los montos pequeños
- `ivaVes = round2(ivaUsd × tasa)`

Con 0,01 USD (8,90 Bs a tasa 890): 0,02 × 16 % = 0,0032 → redondeo → **0,00**.
Con precio normal (5,33 USD, tasa 890, pickup): IVA cobrado 756,50 Bs vs correcto 758,99 Bs.

## Corrección (5.119)
El IVA se calcula sobre la base imponible **en bolívares** — la moneda del cobro y de la factura:
1. `baseVes  = round2((subtotal + envío) × tasa)`
2. `ivaVes   = round2(baseVes × ivaPercent / 100)`  ← **el IVA oficial, en Bs**
3. `ivaUsd   = round2(ivaVes / tasa)`               ← solo referencia (panel admin)
4. `totalVes = round2(subtotalVes + shippingVes + ivaVes)` ← suma cuadrada: el desglose siempre cuadra
5. `totalUsd = round2(subtotal + shipping + ivaUsd)` ← solo referencia

## Lo que NO cambia
- **Conciliación BDV (5.113):** compara contra `totalVes`, que sigue siendo el monto oficial.
- **El cliente:** ni una línea. Las órdenes viejas se muestran con sus valores guardados.
- **Configuración:** `settings/general.ivaPercent` (0–100), igual que antes. 0 = sin IVA.

## Validación
- `tsc` limpio · functions **117 passed / 14 skipped / 0 failed** · raíz **340/340** · `npm run build` ✓
- Aritmética en 6 escenarios: desglose === total en todos.
- **Regresión BDV intacta:** semilla 24 USD × 250,5 · IVA 0 % → `totalVes` 6.012,00 idéntico antes/después.
- Pruebas del dueño en `netlify dev` (producto 0,01 + zona 0,01, tasa 890, IVA 16 %):

  | Escenario | Subtotal | Envío | IVA | Total |
  |---|---|---|---|---|
  | Delivery | 8,90 | 8,90 | **2,85** | **20,65** ✓ |
  | Retiro en tienda | 8,90 | Gratis | **1,42** | **10,32** ✓ |

- Purga 5.118 de las 4 órdenes de prueba: stock y «más pedidos» cuadrados (7 disp. / 0 reservadas / vendidosTotal 0).

## Despliegue
Un solo `git push origin main` (PWA + funciones juntas). **Sin** `firebase deploy`. **Sin** cambios en Firestore.
Nota: el IVA en USD es solo referencia del panel; con montos diminutos de prueba puede mostrar 0,00 — el oficial es el Bs.
