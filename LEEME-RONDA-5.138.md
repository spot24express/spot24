# SPOT 24 · Ronda 5.138 — Modo «Solo precios» con la LISTA DE PRECIOS (+ modos stock y ensayo)

## Qué hace esta ronda

Con tu **LISTA DE PRECIOS** del ERP («REPORTE LISTA DE PRECIOS», columna
**Precio REF c/Imp**), el importador del panel ahora puede **fijar el precio de
cada código que YA EXISTE en tu tienda** con el valor de esa columna **SIN
DECIMALES** (125.81 → 125). No crea nada, no toca el stock, no toca fotos ni
nombres ni categorías. Los códigos que solo están en el PDF quedan fuera (y te
aparecen en el resumen).

Además llega de una vez el modo **Solo stock** que quedó pendiente (ronda 5.137)
y el **MODO ENSAYO**: todo el proceso corre y NO ESCRIBE NADA hasta que
desmarques el ensayo.

## Verificado con TU PDF real (antes de escribir una línea de código)

- Formato detectado: `lista-precios` · **934 filas** leídas · **0 problemas** · 0 duplicados.
- Muestras exactas: D22-850 125.81 → **$125** · SHELL HX5 → **$15** · AMSOIL 5W-30 → **$25** ·
  WHISKYE DEWARS 8 AÑOS «0.75» (botella) → **$17** (no se confunde) · CR45TS «262.305.3» → **$2** (no se confunde) ·
  PAR DE MESETAS 1154.41 → **$1154** · código con apóstrofe 23300'21030 → **$4**.
- **41 artículos de menos de $1** (Pepsi retornable 0.75, condones 0.92, yesqueros 0.25…)
  quedarían en 0 al quitar los decimales → **NO se tocan** (un precio 0 sería un producto
  gratis) y quedan listados en el resumen para que decidas qué hacer con ellos.

## Archivos (copia cada uno a SU MISMA ruta en tu proyecto)

| Archivo de esta carpeta | Ruta en tu proyecto |
| --- | --- |
| `functions-src-lib/inventarioPdf.ts` | `functions/src/lib/inventarioPdf.ts` |
| `functions-src-lib/importInventory.ts` | `functions/src/importInventory.ts` |
| `functions-src-tests/import-precios.test.ts` | `functions/src/__tests__/import-precios.test.ts` (NUEVO) |
| `functions-src-tests/import-stock-ensayo.test.ts` | `functions/src/__tests__/import-stock-ensayo.test.ts` (NUEVO) |
| `netlify-functions/fn-importInventory.ts` | `netlify/functions/fn-importInventory.ts` (quedó IGUAL — solo respaldo) |
| `src-features-admin-services/admin.service.ts` | `src/features/admin/services/admin.service.ts` |
| `src-features-admin-pages/AdminProductsPage.tsx` | `src/features/admin/pages/AdminProductsPage.tsx` |

## Cómo usarlo (todo desde tu panel)

1. Guarda los archivos y espera a que Vite compile (el dev a veces necesita reiniciar:
   el bundle de `netlify/functions` se empaqueta AL ARRANCAR `netlify dev` — si cambias
   `functions/src` con el dev corriendo, **reinicia `netlify dev`**).
2. Panel → **Productos** → **Importar PDF**.
3. Elige el modo **«Solo precios (lista de precios)»**.
4. Deja marcado **«Modo ensayo — NO guarda nada»** (viene marcado).
5. Sube `Lista de Precios de Inventario VIEJO ERICK ACTUALIZADA.pdf` → **«Probar ensayo (no guarda)»**.
6. Revisa el resumen: precios que se fijarían (antes → después), cuántos ya tenían ese
   precio, cuántos códigos no están en la tienda y los 41 menores de $1.
7. Si te cuadra: **desmarca el ensayo** → **«Importar de verdad»**.

## Cómo decide el precio el código existente

- El código del PDF se empareja con `product.code` de tu tienda; si un producto no tiene
  código pero una variante tiene ese código como SKU, también cuenta (igual que siempre).
- El precio nuevo va a la variante emparejada (`sku == código`, si no la primera activa)
  y el precio base del producto se recalcula con todas sus variantes (mínimo) — igual
  criterio que la importación de siempre.
- El IVA: la columna «Precio REF c/Imp» es USD **con** impuesto, que es EXACTAMENTE tu
  modelo 5.120 (el precio publicado ya trae el IVA; el desglose sale en el checkout).
  Con el % de IVA en Ajustes el total no cambia (firmas B1 intactas).

## Tests y verificación (todo en verde en esta ronda)

- `functions`: **73 tests ✓** (incluyen 13 nuevos: parser de la lista de precios con
  coordenadas reales de TU PDF, precio entero, planes de precios y de stock, modos).
- raíz: **252 tests ✓** · typecheck raíz + netlify ✓ · build de producción ✓.

## Orden de despliegue

Puedes pegar todo junto. Si quieres ir por partes: el backend nuevo acepta peticiones
del panel VIEJO sin problema (sin `modo` cae en «completo» y sin `ensayo` escribe
normalmente) — ningún paso intermedio rompe nada.
