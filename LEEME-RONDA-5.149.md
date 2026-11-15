# LEEME · Ronda 5.149 — «RECIÉN LLEGADOS VACÍO Y CARGAR MÁS A CIEGAS» (post-importación)

**Base:** `356668c` (rondas 5.145–5.148). **Cero solapamiento** con lo pendiente: solo toca catálogo (servicio + 1 libra nueva + 1 test nuevo). Sin cambios de backend, sin índices nuevos, sin reglas nuevas, sin migración de datos.
**Qué resuelve:** después de usar **Importar PDF → Solo stock + Solo precios**, el Home dejó de mostrar **«Recién llegados»** y en **Catálogo → Ver todo** había que tocar **«Cargar más»** varias veces para que aparecieran productos. Con esta ronda ambas secciones vuelven a comportarse como antes **sin borrar ni tocar un solo producto de tu base**.

---

## 1 · Diagnóstico (qué pasó de verdad)

Los dos síntomas tienen UNA sola causa, y es el comportamiento **por diseño** del modo stock (5.137):

- El modo **«Solo stock»** crea como **ALTAS** todo código del PDF que NO exista en la tienda. Esas altas nacen **INACTIVAS** (`active: false`), **sin categoría** (`categoryId: ''`) y **sin precio** (`basePriceUsd: 0`) — decisión tuya de la 5.137 para que jamás salga a la venta un producto a medio importar (`functions/src/importInventory.ts` · `datosProductoNuevoStock`). El modo «Solo precios» no crea nada: solo fija precios de los que ya existen.
- Las altas nacen con `createdAt` = el momento de la importación ⇒ quedan **a la CABEZA** del orden `createdAt desc` que usan el catálogo y el Home.
- La consulta pública de productos (`catalog.service.ts` · `buildProductsQuery`) **no filtra activos en Firestore** — los filtraba EN CÓDIGO después de leer cada página (para no exigir índices compuestos). Resultado con un bloque de inactivos a la cabeza:
  - **Catálogo:** cada página leía 12 docs crudos, el filtro en código los descartaba ⇒ grilla vacía y «Cargar más» sin efecto visible hasta pasar el bloque completo (12 taps por docena de pendientes).
  - **Home «Recién llegados»:** el pool toma hasta 3 tandas de 24 (`debeCargarMasPaginas`, 5.107); con el bloque de inactivos tapando la cabeza, `curarRecientes` no encontraba ni 8 activos ⇒ la sección quedaba con el estado vacío «Catálogo en preparación».

**Importante:** NO fue un error de fechas. Las altas nacen con fecha NUMÉRICA correcta (5.92e). Tu `normalizar-fechas.mjs` (5.97) arregla otra enfermedad con síntomas parecidos (mezcla Timestamp vs número enterrando productos); si lo corréis hoy en simulación va a decir **«Nada que corregir»** — señal de que tu base está limpia de tipos. No hace falta correrlo para este caso.

---

## 2 · La cura (los 3 archivos de la ronda)

| Archivo | Cambio |
|---|---|
| `src/features/catalog/lib/listado.ts` **(NUEVO)** | Libra pura `consultaSoloActivos(q)`: decide si la consulta puede llevar `where('active','==',true)` según los **índices compuestos YA desplegados** en `firestore.indexes.json` (5.76/5.81): `active+createdAt` (listado sin filtros) y `categoryId+active+createdAt` (por bahía, cubre `==` y `in`). Devuelve false en los combos sin índice (búsqueda `q`, `stockTotal > 0`, rangos de precio) para que **jamás** salga un FAILED_PRECONDITION. |
| `src/features/catalog/services/catalog.service.ts` **(MODIFICADO)** | `buildProductsQuery` agrega `where('active','==',true)` cuando `consultaSoloActivos(q)` lo permite. Cada página trae SOLO productos vendibles: el catálogo llena sus 12 tarjetas de una vez y el pool del Home recibe activos desde la 1ª tanda. El cursor por snapshot (`startAfter(doc)`) sigue válido: cambia el índice, no la posición. En búsqueda y filtros de precio/stock queda el comportamiento de siempre (filtro en código). |
| `src/tests/catalog-filtro-activos.test.ts` **(NUEVO)** | 11 tests de la libra: combos con índice (sin filtros, categoryId, categoryIds) → `true`; combos sin índice (q, q+bahía, stock, bahía+stock, precio máx, precio mín, precio 0, precio+stock) → `false`. |

**Por qué no se toca nada más:**
- La búsqueda por código y por nombre ya filtra activos en código y con códigos específicos el bloque de inactivos no tapa (además las altas SIN categoría no entran en búsquedas por bahía).
- «Los más pedidos» queda a salvo solo: los docs sin `vendidosTotal` los excluye Firestore.
- «Relacionados» filtra por categoría exacta y las altas no tienen categoría ⇒ nunca se ven afectados.
- El **panel admin** lista TODOS los productos (activos e inactivos) por su propio camino: tus altas pendientes siguen viéndose ahí para completarlas o borrarlas — no desaparece nada.

---

## 3 · Verificación (ejecutada)

```bash
npm run typecheck   # ✔ tsc --noEmit limpio (web)
npm test            # ✔ 35 archivos · 464/464 pruebas (453 previas + 11 nuevas)
npm run lint        # ✔ 0 errores (14 warnings pre-existentes de otros módulos)
npm run build:only  # ✔ 120 entradas de precache, bundle dentro de presupuesto
```

Suite `functions/` intacta: esta ronda no toca ni una línea de `functions/src/` ni de `netlify/functions/`.

---

## 4 · Checklist en producción (Netlify)

1. Commit + push de la rama (`web` es lo único que cambia; no deployes funciones).
2. Netlify deploy del sitio (build normal de Vite — sin variables nuevas).
3. **Home:** «Recién llegados» vuelve a mostrar el carrusel con hasta 8 piezas activas.
4. **Catálogo → Ver todo:** la primera pantalla trae 12 productos reales y cada «Cargar más» trae 12 más — sin toques a ciegas.
5. **Catálogo por bahía:** sigue bien (ahora además ignora inactivos en la consulta).
6. **Búsqueda** y filtros «Solo disponibles»/precio: igual que hoy (no se ven afectados por esta ronda).
7. PWA instalada: al abrir después del deploy, el service worker se actualiza solo (`autoUpdate`); si un cliente lo tiene abierto, refresca al recargar.

---

## 5 · Tu bloque de pendientes del importador (opcional, tu decisión)

Las altas inactivas **siguen en tu base** — son tu lista de «códigos del ERP que aún no están en la tienda», tal como se diseñó en 5.137. Ahora ya no estorban la tienda pública. Para procesarlas desde **Admin → Productos** (ordenadas primero por fecha de importación):

- **Si te sirven:** asígnale bahía y precio desde el panel y actívalas — salen a la venta normal.
- **Si no te sirven:** bórralas con «Eliminar producto» (función `fn-deleteProduct`, ya en el panel).
- Si la lista es muy larga y prefieres un barrido masivo (criterio: `active:false` + `categoryId:''` + `basePriceUsd:0` + fecha de la importación, con simulación y respaldo como `normalizar-fechas.mjs`), pídela y se entrega como herramienta local del dueño.

**Mejora futura (opcional):** si quieres que también «Solo disponibles» y los filtros de precio ignoren inactivos en la consulta, se agregan 3 índices compuestos a `firestore.indexes.json` (`active+stockTotal+createdAt`, `active+basePriceUsd+createdAt` y su combo) y un deploy de índices — hoy no hace falta: las altas sin precio quedan fuera de esos filtros por `basePriceUsd: 0` solo si el mínimo es >0, y con la tienda curada el bloque tapa cada vez menos.
