# RONDA 5.103 · «Recién llegados» vuelve a llenarse: hasta 8 productos siempre

## Tu reporte de hoy

> «Ya edité y todo bien. En recién llegados solo se ven dos productos.»

## El problema, en cristiano

- «Recién llegados» toma tus 24 productos más recientes y los «cura» para que
  la sección no salga monotemática: **máximo 2 por categoría** (esa regla la
  pusimos en la ronda 5.98 cuando 8 piezas de una sola marca se comían la
  sección).
- Tu última importación (los accesorios, 25/10) metió todos los productos de
  UNA sola categoría y con la MISMA fecha: los 24 recientes son todos de esa
  tanda → el tope de «2 por categoría» dejaba la sección en **2 productos**.
- La regla que evitaba el monotema se volvió en tu contra cuando importas una
  tanda grande de una sola categoría. Tus ediciones de los MOOG no tienen nada
  que ver (eso lo arregló la ronda 5.102 del panel).

## Qué cambia (3 archivos)

1. **Variedad primero**: si hay varias categorías entre lo reciente, sigue
   saliendo mezclado (máximo 2 por categoría, igual que antes).
2. **RELLENO nuevo (el fix)**: si con ese tope la vitrina no se llena —tu
   caso—, se completa **hasta 8** con los más recientes que faltaron, aunque
   sean de la misma categoría. Ya no se queda en 2.
3. **Orden por fecha intacto**: el relleno se reordena para que la sección
   siempre se lea de lo más nuevo a lo más viejo.

Resultado: «Recién llegados» muestra **siempre hasta 8 productos** (o todos,
si tienes menos), con variedad cuando la hay.

## Probado antes de entregar

- Typecheck ×3, lint 0 errores, pruebas raíz **204/204** (la vitrina pasa de
  3 a 6 pruebas: entre ellas «8 piezas de UNA bahía → salen las 8», que
  reproduce tu caso exacto).
- Funciones **46 pasan / 14 omitidas** (igual que la ronda anterior; no se
  tocó nada del backend).
- Reglas de Firestore **21/21** con emulador.
- Build de producción: **precache 115** (igual que la ronda anterior, sin
  sorpresas).

## Despliegue — pasos

1. **Sube el proyecto a Netlify** (push a GitHub como siempre). Los archivos
   que cambian en esta ronda:

   | # | Archivo | Acción |
   |---|---------|--------|
   | 1 | `src/features/catalog/lib/vitrina.ts` | ACTUALIZA |
   | 2 | `src/features/catalog/pages/HomePage.tsx` | ACTUALIZA (solo comentarios) |
   | 3 | `src/tests/vitrina-home.test.ts` | ACTUALIZA |
   | 4 | (referencia) `LEEME-RONDA-5.103.md` | este archivo |

2. **Recarga la PWA** (Ctrl+F5 en PC; en el teléfono, desliza la app fuera de
   las recientes y vuelve a entrar, para que el service worker nuevo tome el
   control).

3. **Comprueba en el Home**: «Recién llegados» debe mostrar **8 productos** de
   tu última importación (CARGADOR IPHONE 17 PRO MAX, ALICATE 5 EN 1, etc.),
   en orden de lo más nuevo a lo más viejo.

## Notas técnicas (por si las necesitas)

- La ventana sigue siendo 24 recientes: **no gasta lecturas extra**. Si algún
  día quieres mezclar 2-3 importaciones distintas dentro de la sección, se
  puede ampliar a 48 (sigue en cola como propuesta, a tu decisión).
- El tope de 2 por categoría se mantiene como *preferencia* de variedad: solo
  cede cuando las categorías nuevas no alcanzan para llenar la vitrina.
- Hallazgo del laboratorio (NO afecta tu tienda): dos archivos de prueba del
  backend comparten el mismo usuario ficticio en el emulador y se estorban
  entre sí (un token de notificación duplicado en 3 pruebas). Es un asunto de
  aislamiento de pruebas, sin impacto en producción; queda anotado para una
  ronda futura de limpieza.
