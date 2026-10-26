# RONDA 5.100 · Purga de órdenes de prueba: referencias muertas + «Los más pedidos»

## Qué resuelve (tu reporte de hoy)

> Ejecutaste `node functions\scripts\purge-test-order.mjs --last --yes --reset-counter`
> y salió:  `✖ 5 NOT_FOUND: No document to update: …/products/vRup811bPQjy4SSq5Gjl/
> variants/vRup811bPQjy4SSq5Gjl-v1`

**Primero, lo importante: NO se borró nada.** El script pone TODO en un solo
lote de Firestore y ese lote es atómico (todo o nada): el intento de actualizar
la variante muerta canceló la purga COMPLETA. Tu orden SP-261019-0009, sus
eventos, su reserva, la idempotencia, el auditLog y el contador — todo sigue
ahí, intacto. No quedó nada a medias.

## El problema, en cristiano

- La orden de prueba SP-261019-0009 compró una **CAJA PILAS AA ALKALINAMAXELL**
  que YA NO EXISTE: borraste ese producto del panel en algún momento después
  de la compra de prueba (lo verifiqué en producción, solo lectura: ni el
  producto ni su variante quedan).
- El script leía la variante para ajustar el stock, encontraba ceros (porque
  el doc no existe) y de todas formas intentaba ESCRIBIR sobre ella →
  Firestore responde NOT_FOUND → todo el lote se cancela.
- Es el mismo aprendizaje del importador (5.92b): las referencias muertas se
  detectan y se OMITEN, no tumban el proceso.

## Qué cambia en el script (1 archivo)

1. **Referencias muertas omitidas**: si el producto o la variante ya no existe,
   el plan lo muestra con «⚠ el producto o la variante ya no existe (borrado)
   → nada que ajustar» y sigue. La purga completa sin drama.
2. **«Los más pedidos» también se limpia**: si la orden quedó ENTREGADA, con
   la ronda 5.98 sus unidades ya sumaron en el contador `vendidosTotal` del
   producto («Los más pedidos» del Home). La purga ahora lo REBAJA para que
   el catálogo quede como si la orden nunca hubiera existido — tu «empezar
   desde cero» se mantiene. Solo toca productos que existen y tienen el
   contador; los anteriores a 5.98 no tienen nada que rebajar.
3. **No escribe en vano**: un ajuste 0 → 0 ya no genera escritura.
4. `--keep-stock` ahora significa «no tocar NINGÚN producto» (stock,
   stockTotal y vendidosTotal).

## Probado de verdad antes de entregar

Recreé tu caso EXACTO en el emulador de Firestore (orden entregada con flujo
de reserva, un producto vivo con stockReserved 2 y vendidosTotal 7, y un
producto BORRADO) y corrí el script completo:

- Simulación: plan correcto (2 → 0, 7 → 5, ⚠ en el borrado).
- Ejecución real: PURGA COMPLETADA; 10/10 comprobaciones ok:
  orden borrada · events borrados · idempotencia borrada · reserva borrada ·
  auditLog borrado · stockReserved 2→0 · stock intacto (flujo reserva) ·
  vendidosTotal 7→5 · contador a 0 · la orden vieja no fue tocada.

## Despliegue — pasos

1. **Copia 1 archivo** sobre tu repo `C:\Users\Erick\spot24` (ya lo tienes;
   sobrescrívelo):

   | # | Archivo | Acción |
   |---|---------|--------|
   | 1 | `functions/scripts/purge-test-order.mjs` | ACTUALIZA |
   | 2 | (referencia) `LEEME-RONDA-5.100.md` | este archivo |

   Este script corre en TU PC: no hace falta `git push` para usarlo. (Si
   quieres llevarlo al repo para tenerlo versionado, el push lo incluye
   cuando te acomode — junto con los lotes 5.98/5.99 pendientes.)

2. **Repite tu MISMO comando** (la orden sigue ahí porque no se borró nada):

   ```powershell
   node functions\scripts\purge-test-order.mjs --last
   ```

   Revisa el plan: verás la línea «⚠ el producto o la variante ya no existe
   (borrado) → nada que ajustar». Si estás de acuerdo:

   ```powershell
   node functions\scripts\purge-test-order.mjs --last --yes --reset-counter
   ```

3. **Para quitar TODAS las órdenes de prueba**, repite el ciclo hasta que no
   queden: `--last` (simula) → revisa → agrega `--yes` → otra vez. Cuando
   diga «No hay ninguna orden en Firestore» terminaste (o cuando la lista solo
   muestre órdenes reales). El comando sin argumentos muestra las 10 más
   recientes:

   ```powershell
   node functions\scripts\purge-test-order.mjs
   ```

   Si prefieres apuntar a una específica: `--code SP-261019-0009` o
   `--id <orderId>`.

4. **Comprueba después** (opcional): panel → Pedidos: la lista sin las de
   prueba. Home de la tienda: «Los más pedidos» sigue oculto o solo con ventas
   reales (el contador quedó limpio).

## Notas técnicas (por si las necesitas)

- El lote sigue siendo UNO y atómico (o se hace todo o nada): lo que cambió es
  que el lote solo trae escrituras sobre documentos que existen — el modo de
  fallo que quedó es «no se borró nada, reintenta», que es el seguro deseable.
- La rebaja de vendidosTotal es espejo exacto de como el backend la suma
  (functions/src/domain/vendidos.ts: suma por producto, tope 1000 por línea),
  con piso en 0.
- El script ahora acepta `FIREBASE_PROJECT_ID` + `FIRESTORE_EMULATOR_HOST`
  para correr contra el emulador sin tocar producción (así se probó). En tu
  PC normal no los pones y todo sigue igual que siempre: `.env` raíz y listo.
- Cero escrituras en tu Firestore desde el laboratorio: todo se probó en el
  emulador y tu producción solo se LEO para el diagnóstico.
