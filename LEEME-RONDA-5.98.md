# RONDA 5.98 · El Home que vende (C+D+F+G) — arrancando desde cero

## Qué resuelve (tus pedidos)

> «Quiero el punto C (Los más pedidos)» ✔ · «Quiero el punto D (curar Recién
> llegados)» ✔ · «Quiero el punto F (Vuelve a comprar)» ✔ · «Quiero el punto G
> pero SOLO con reseñas (sin cupones)» ✔ · «La idea es comenzar desde cero sin
> ninguna venta» ✔ (sin script histórico: el contador arranca en 0 y solo sube
> con cada entrega real) · «Aun no hagas nada sin mi aprobación» ✔ (solo lo
> aprobado: B ofertas y E CTA en promos NO se tocaron)

## Los cambios, en tu idioma

### 1. «Los más pedidos» (C) — nace oculto y se puebla solo

- Cada vez que MARCAS UN PEDIDO COMO **Entregado** (despacho, delivery o tu
  válvula de admin), las unidades de cada pieza se le SUMAN a un contador
  interno (`vendidosTotal`) del producto. Todo en la misma transacción: si algo
  falla, no cambia ni el estado ni el contador. «Entregado» es terminal: el
  contador corre UNA sola vez por pedido (los cancelados no suman).
- La sección **«Los más pedidos»** en el Home es una hilera de tarjetas que
  **avanza sola cada 5 segundos** (pausa cuando el cliente la toca, reanuda a
  los 10 s). Con **cero ventas la sección NO aparece** — como pediste, partimos
  desde cero. Con la primera entrega empieza a poblar sola, ordenado por lo más
  vendido (empate: lo más nuevo primero). Sin índices nuevos en Firestore.

### 2. «Recién llegados» curado (D) — adiós al monotema

- Antes salían los 8 últimos por fecha (el caso real: 8 OLD MAN EMU de una sola
  importación). Ahora **máximo 2 piezas por bahía**, tomando de los 24 más
  recientes: la sección muestra variedad de todo el negocio.
- Botón **«Ver todo»** junto al título → lleva al catálogo completo.

### 3. «Vuelve a comprar» (F) — solo para quien ya compró

- Cliente con sesión que ya compró: el Home le muestra (tras la franja de
  cobertura) sus piezas compradas en sus últimos 10 pedidos, activas y con
  stock, en la misma hilera que avanza sola. Con el botón + de siempre agrega
  directo.
- Sin sesión o sin compras → la sección no existe. Cero datos de otros clientes.

### 4. Reseñas (G) — solo reseñas, sin cupones

- El cliente conecta su cuenta y en la **ficha del producto** ve el bloque
  «Reseñas (N)» con el promedio de estrellas. Puede escribir la suya: 5
  estrellas + texto corto (máx. 400 letras).
- **Solo quien compró y ya RECIBIÓ la pieza** puede reseñar: lo comprueba el
  servidor contra sus pedidos entregados (el cliente no puede fingirlo). UNA
  reseña por cliente por producto.
- Las tarjetas del catálogo muestran una fila fina «★ 4.8 (12)» SOLO cuando el
  producto ya tiene reseñas visibles.
- **Moderación desde tu panel**: Admin → Productos → editar producto → bloque
  «Reseñas (N) — moderación». Por cada reseña: **Ocultar** (sale de la tienda y
  baja del promedio, sin borrar) / **Mostrar** / **Eliminar** (definitivo). El
  promedio se recalcula solo con las visibles al instante.
- Sin cupones, sin recompensas (lo que descartaste). Sin colecciones nuevas y
  SIN cambios de reglas de Firestore (las reseñas viven dentro del doc del
  producto).

### 5. Nada sin datos (tu «desde cero»)

- Las 3 secciones nuevas (Vuelve a comprar, Los más pedidos, Reseñas) aparecen
  SOLO cuando existan datos reales. Hoy tu tienda arranca limpia y cada una se
  enciende sola con el uso: primera entrega → «Los más pedidos»; primera reseña
  → bloque en la ficha; primera compra de un cliente → su «Vuelve a comprar».
- **NO se precargó nada del histórico** de pedidos viejos (sin script: no hay
  nada que recalcular — el contador arranca en 0 hoy).

## Despliegue — pasos EN ESTE ORDEN

1. **Copia los 23 archivos de esta ronda** sobre tu repo `C:\Users\Erick\spot24`,
   respetando las carpetas (la estructura del lote es la del repo).
   **5.98: NUEVOS (12)** — créalos con su carpeta si no existe:
   - `src/features/catalog/lib/vitrina.ts` (libra de la vitrina: curado + rating)
   - `src/features/catalog/hooks/useAutoCarousel.ts` (carrusel que avanza solo)
   - `src/features/catalog/services/reviews.service.ts` (reseñas: lectura + envío)
   - `src/features/catalog/components/ResenasProducto.tsx` (bloque en la ficha)
   - `src/features/admin/components/ResenasAdmin.tsx` (moderación en tu panel)
   - `src/tests/vitrina-home.test.ts` y `src/tests/resenas.test.ts` (tests; no
     corren en producción)
   - `functions/src/reviews.ts` (validación server-side de la reseña)
   - `functions/src/domain/vendidos.ts` (suma de unidades entregadas — libra pura)
   - `functions/src/__tests__/vendidos-core.test.ts` (tests del backend)
   - `netlify/functions/fn-addReview.ts` (la función de servidor nueva)
   **5.98: ACTUALIZA (11)** — sobrescribe con el del lote:
   - `src/features/catalog/types/index.ts`, `src/features/catalog/services/catalog.service.ts`,
     `src/features/catalog/hooks/useCatalog.ts`, `src/features/catalog/components/ProductCard.tsx`,
     `src/features/catalog/pages/ProductPage.tsx`, `src/features/catalog/pages/HomePage.tsx`,
     `src/features/orders/services/orders.service.ts`,
     `src/features/admin/services/admin.service.ts`, `src/features/admin/pages/AdminProductsPage.tsx`,
     `functions/src/dispatch.ts`, `netlify.toml` (timeout de la fn nueva).
2. El resto del lote (104 archivos) es el MISMO que ya copiaste en la ronda
   5.75–5.96: no necesitas recopiarlo. Las instrucciones previas siguen valiendo
   (LEEME-RONDA-5.75.md sigue incluido en el lote como referencia).
3. Nada de `firebase deploy`: todo entra **solo con tu `git push`** (las reglas
   de Firestore NO cambiaron; la fn nueva se despliega con el build de Netlify).
4. Después del push, tu `node functions\scripts\normalizar-fechas.mjs` ya no
   vuelve a hacer falta: el importador y el panel (5.95) normalizan las fechas
   solos. El script queda guardado por si acaso (es idempotente).

## Probar en tu PC con `netlify dev` (opcional, antes de subir nada)

1. Copia los 23 archivos → en tu PC: `npm install` (si cambió lock: no cambió
   en esta ronda) → `netlify dev` → abre `http://localhost:8888`.
2. El Home debe verse IGUAL que hoy (las 3 secciones nuevas NO aparecen: no hay
   datos todavía — así debe ser).
3. Ficha de un producto: sin reseñas el bloque no sale (correcto).
4. Tu panel → Productos → editar: sin reseñas, sin el bloque de moderación.

## Cómo probar (10 minutos, después del push)

1. **Compra de prueba**: entra con tu cuenta de cliente, compra 2 unidades de
   una pieza, paga/verifica y márcala **Entregado** en despacho.
2. Recarga el Home: **«Los más pedidos»** ya existe con esa pieza (hilera que
   avanza sola). Con más entregas se llena el top.
3. En la ficha de esa pieza (con tu cuenta de cliente): escribe la **reseña**
   (5 estrellas + texto). Aparece en la ficha y la estrellita en la tarjeta.
4. En tu panel (admin): editar esa pieza → **Reseñas — moderación** → «Ocultar».
   La reseña sale de la tienda y el promedio baja al instante. «Mostrar» la
   devuelve.
5. **Vuelve a comprar**: con esa compra hecha, el Home (con tu sesión de
   cliente) ya te muestra la sección con esa pieza.
6. Probar que un cliente SIN compra no puede reseñar: la fn responde «Solo
   puedes reseñar piezas que compraste y ya recibiste.» (el toast lo muestra).

## Archivos de ESTA ronda (23) — copiar SOBRE tu repo, respetando carpetas

| # | Archivo | Acción |
|---|---------|--------|
| 1 | `src/features/catalog/types/index.ts` | ACTUALIZA |
| 2 | `src/features/catalog/services/catalog.service.ts` | ACTUALIZA |
| 3 | `src/features/catalog/hooks/useCatalog.ts` | ACTUALIZA |
| 4 | `src/features/catalog/hooks/useAutoCarousel.ts` | NUEVO |
| 5 | `src/features/catalog/lib/vitrina.ts` | NUEVO |
| 6 | `src/features/catalog/services/reviews.service.ts` | NUEVO |
| 7 | `src/features/catalog/components/ProductCard.tsx` | ACTUALIZA |
| 8 | `src/features/catalog/components/ResenasProducto.tsx` | NUEVO |
| 9 | `src/features/catalog/pages/HomePage.tsx` | ACTUALIZA |
| 10 | `src/features/catalog/pages/ProductPage.tsx` | ACTUALIZA |
| 11 | `src/features/orders/services/orders.service.ts` | ACTUALIZA |
| 12 | `src/features/admin/services/admin.service.ts` | ACTUALIZA |
| 13 | `src/features/admin/pages/AdminProductsPage.tsx` | ACTUALIZA |
| 14 | `src/features/admin/components/ResenasAdmin.tsx` | NUEVO |
| 15 | `src/tests/vitrina-home.test.ts` | NUEVO (tests) |
| 16 | `src/tests/resenas.test.ts` | NUEVO (tests) |
| 17 | `functions/src/dispatch.ts` | ACTUALIZA |
| 18 | `functions/src/reviews.ts` | NUEVO |
| 19 | `functions/src/domain/vendidos.ts` | NUEVO |
| 20 | `functions/src/__tests__/vendidos-core.test.ts` | NUEVO (tests) |
| 21 | `netlify/functions/fn-addReview.ts` | NUEVO |
| 22 | `netlify.toml` | ACTUALIZA |
| 23 | (referencia) `LEEME-RONDA-5.98.md` | este archivo |

Total del lote acumulado: **116 archivos de código + 2 LEEME** (104 que ya
tenías + 12 nuevos de esta ronda).

## Verificado antes de entregar

- Typecheck ×3 (raíz + `typecheck:netlify` + functions `tsc`): **OK**.
- Lint: **0 errores** (10 warnings preexistentes, los mismos de siempre).
- Tests raíz (vitest): **193/193** (182 previos + 11 nuevos de vitrina/reseñas).
- Tests functions: **46 passed · 14 skipped por entorno** (42 previos + 4 nuevos
  del contador de vendidos).
- Build de producción: **verde, precache 115** — el MISMO número de archivos
  precacheados que tu último build (los cambios viven dentro de los chunks que
  ya existen: sin sorpresas de red en la PWA).
- Sin índices compuestos nuevos en Firestore (consulta de top por campo único +
  filtros en código, mismo criterio del resto del catálogo).
- Sin cambios en `firestore.rules` (reseñas y vendidosTotal son campos extra
  que las reglas ya permiten — verificado contra `productValid()`).
- Cero escrituras en tu Firestore desde el laboratorio: tu catálogo y tus
  pedidos NO fueron tocados (la corrida de normalización de fechas fue tuya,
  desde tu PC, con tu respaldo).

## Notas técnicas (por si las necesitas)

- El contador vive como `vendidosTotal` en cada doc de producto. Productos sin
  el campo = nunca vendidos (no salen en la consulta del top — así la sección
  nace oculta sin un campo extra en los 552 docs).
- La reseña viaja en el array `reviews` del doc del producto (tope 50 últimas).
  `ratingAvg`/`ratingCount` se recalculan SOLO con las visibles, tanto al
  publicar (backend) como al moderar (panel).
- fn-addReview comprueba la compra leyendo hasta los últimos 50 pedidos del
  cliente (solo campos uid/status/lines — lectura liviana). Pedidos cancelados
  NO cuentan. El texto se sanea igual en front y backend (sin caracteres de
  control, tope 400).
- El carrusel de promos del Home ahora usa el MISMO hook que las hileras nuevas
  (`useAutoCarousel`): comportamiento idéntico al que ya conoces (5 s / pausa
  al tocar / reanuda a los 10 s) — sin duplicar código.
