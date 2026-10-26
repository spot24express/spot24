# RONDA 5.104 · El chip dice «Última disponible» cuando queda una sola pieza

## Tu reporte de hoy

> «Ya purgué los pedidos de prueba y todo bien. Ahora en recién llegados se
> muestran cinco. Cuando quede un solo producto, en el chip de las tarjetas,
> en lugar de decir últimas 1 debe decir última disponible.»

## Lo del chip (el fix de esta ronda)

- **Antes**: un producto con 1 unidad mostraba el chip «ÚLTIMAS 1» (suena
  raro y no invita a comprar).
- **Ahora**: con **1 pieza** el chip dice **«ÚLTIMA DISPONIBLE»**. Con 2 a 5
  sigue «ÚLTIMAS N», y con 0 sigue «AGOTADO». El umbral no cambió: solo el
  texto de la cantidad 1.
- Un solo texto para TODO: el chip de la **tarjeta** (Home, catálogo) y el
  badge de la **ficha** del producto comparten la misma función
  (`etiquetaStock`), mismo criterio de la ronda 5.92f de que la tienda hable
  un solo idioma.
- Ejemplo con tu tienda de HOY: ALICATE 5 EN 1, CAJA DE HERRAMIENTAS 85 PCS,
  JUEGO DE LLAVES COMBINADAS y CORNETA PIONEER 350W tienen stock 1 → verás
  «ÚLTIMA DISPONIBLE» en ellas nada más desplegar.

## Sobre «se muestran cinco» en Recién llegados

- Comprobado con **lectura directa de tu producción** (nada de escrituras):
  **el fix de la vitrina (ronda 5.103) aún no está subido** — el sitio en vivo
  corre un bundle distinto al de la 5.103. Lo que ves ahora (5) es el código
  viejo con un estado anterior de la ventana.
- Con los datos de HOY (los 24 recientes son de Accesorios Importados, todos
  activos), la vitrina 5.103 muestra **8**: CARGADOR IPHONE 17 PRO MAX,
  ALICATE 5 EN 1, TERMO TIPO STANLEY, CANDADO DE MOTOCICLETA, CAJA DE
  HERRAMIENTAS 85 PCS, JUEGO DE LLAVES COMBINADAS, TACO DE CARGADOR 20W
  USB-C y CORNETA PIONEER 350W — en orden de lo más nuevo a lo más viejo.
- **Este lote incluye la 5.103**: al subirlo entran las dos rondas juntas y
  la sección pasa a llenarse hasta 8 (o todas, si hay menos).
- Regla para el futuro: la vitrina muestra lo que HAY. Si desactivas o
  borras piezas recientes, muestra menos; si importas más, se llena sola
  hasta 8.

## Probado antes de entregar

- Typecheck ×4, lint 0 errores (10 warnings de siempre).
- Pruebas raíz **207/207** (204 + 3 nuevas del chip: una pieza → «Última
  disponible», de 2 en adelante → «Últimas N», cero → «Agotado»).
- Funciones **46 pasan / 14 omitidas** (igual al baseline; el backend no se
  tocó) y reglas de Firestore **21/21** con emulador.
- Build de producción: **precache 116** (antes 115). La diferencia está
  explicada y probada con doble build: código 5.103 → 115 exacto; código
  5.104 → 116. El +1 es el archivo compartido `display.ts` que ahora sale
  como su propio chunk (`display.js`, ~1 KB) porque la ficha también lo
  importa. Ningún archivo suelto ni perdido (cotejado archivo por archivo).

## Despliegue — pasos

1. **Sube el proyecto a Netlify** (push a GitHub como siempre). Los archivos
   que cambian en esta ronda:

   | # | Archivo | Acción |
   |---|---------|--------|
   | 1 | `src/features/catalog/components/ProductCard.tsx` | ACTUALIZA |
   | 2 | `src/shared/components/ui/PriceTag.tsx` | ACTUALIZA |
   | 3 | `src/shared/lib/display.ts` | ACTUALIZA (NUEVO en el lote) |
   | 4 | `src/tests/display.test.ts` | ACTUALIZA (NUEVO en el lote) |
   | 5 | (referencia) `LEEME-RONDA-5.104.md` | este archivo |

   OJO con los 2 marcados «NUEVO en el lote»: `display.ts` y
   `display.test.ts` son de antes de la base acumulada 5.75 y por eso no
   aparecían en los LEEME anteriores; en tu repo ya existen y solo se
   sobrescriben. **`display.ts` es obligatorio**: la tarjeta y la ficha
   importan de él la función del chip — si no se sube, el build rompe.

2. **Recarga la PWA** (Ctrl+F5 en PC; en el teléfono, desliza la app fuera
   de las recientes y vuelve a entrar).

3. **Comprueba**: un producto con 1 unidad muestra «ÚLTIMA DISPONIBLE»
   (ej. ALICATE 5 EN 1) y «Recién llegados» muestra **8 productos**.

## Notas técnicas (por si las necesitas)

- El umbral del chip sigue siendo 5 en tarjeta y ficha; esta ronda solo
  cambió el TEXTO cuando queda exactamente 1.
- La purga de pedidos de prueba quedó **cerrada por ti** — no hay nada
  pendiente ahí.
- La ampliación de la ventana de recientes 24 → 48 sigue en cola como
  propuesta, a tu decisión (hoy no hace falta: con el relleno la vitrina
  llega a 8 con tus datos actuales).
