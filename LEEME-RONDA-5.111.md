# LEEME · Ronda 5.111 — Catálogo estilo app de conveniencia (filtros al mínimo · cascada RETIRADA)

**Fecha:** 27/10/2026 · **Actualización:** 28/10/2026 — la cascada se RETIRÓ a pedido del dueño
**Estado:** implementada y validada (build ✓ · clon 230/230 · tu árbol: 261/261)
**Alcance:** los 3 puntos que aprobaste (1+2+3) sobre cómo salen los productos en la app de
farmacia de referencia — con el punto 1 (cascada) anulado después de probarlo: **las tarjetas
aparecen al instante, como toda la vida**. Conserva «Solo disponibles» y «Precio máx.» (tu pedido
expreso). RootLayout, el footer y el aviso de instalar de la 5.110 NO se tocan. CERO lecturas
nuevas a Firebase.

---

## 1) Los 3 puntos aprobados, estado final

**Punto 1 · Cascada de tarjetas → RETIRADA.** Se implementó, se probó en local y la decisión
del dueño fue: no gusta, fuera. Cómo se retiró (lo más seguro posible): la animación vivía en
`index.css` (`@keyframes card-in` + `.card-enter`); al borrar ese bloque, la cascada muere en
TODA la app de una sola vez — Home, catálogo, búsqueda y «Cargar más» — sin tocar ni una línea
de HomePage (donde vive el fix del héroe de la 5.109) ni de los carruseles. Los envoltorios que
quedaron en el código quedan DORMIDOS: una clase sin CSS no hace nada, ni estorba ni cuesta.
Resultado en pantalla: las tarjetas entran al instante, sin escalera ni fundido, exactamente
como antes de esta ronda.

**Punto 2 · Categoría con subcategorías → SOLO subcategorías.** Entras a una bahía con
hijas y ves ÚNICAMENTE las tarjetas de subcategorías (sin tarjetas de productos ni vacío).
Pulsas una y salen sus productos. Era el comportamiento de la 5.81; ahora sin competencia
visual: **los chips de categorías de la barra de filtros se retiraron** — la navegación es
con la grilla de bahías, las tarjetas de subcategorías y el buscador.

**Punto 3 · Filtros al mínimo.** La barra queda en UNA fila:
`[Ordenar ▾] [Solo disponibles] [Precio máx.] [Ver todo]`
- **Ordenar** (NUEVO): Recientes (el de siempre) / Menor precio / Mayor precio.
- **Solo disponibles** y **Precio máx.**: conservados (tu pedido expreso).
- **Ver todo** (solo si hay algo activo): limpia TODO de un toque — categoría, búsqueda,
  filtros y orden.

## 2) Cero costo en Firestore (importante)

- **El orden por precio es de CLIENTE:** se recalcula sobre las tarjetas YA cargadas.
  Sin índices compuestos nuevos, sin lecturas extra, sin tocar backend. Al pulsar
  «Cargar más» la lista crece y se reordena sola en pantalla (con el catálogo completo
  cargado el orden queda global). Con tu tamaño de catálogo es imperceptible.
- Retirar la cascada no toca datos ni consultas: era solo pintura.
- La bahía con subcategorías sigue SIN consultar productos hasta que entras a una
  (ahorro que ya venía de la 5.81).

## 3) Archivos de la ronda (3 nuevos + 3 actualizados)

**NUEVOS (3):**
- `src/shared/lib/cascada.ts` — QUEDA DORMIDO: se conserva porque HomePage/CatalogPage
  todavía importan de él; sin el CSS ya no produce ningún efecto visual. Su limpieza fina
  (quitar envoltorios e import) es material de una ronda futura — NO lo borres ahora o el
  build se cae.
- `src/features/catalog/lib/orden.ts` — ordenar por precio en cliente, lógica pura testeada.
- `src/tests/cascada-orden.test.ts` — 14 tests nuevos (node, sin navegador). Siguen verdes:
  prueban la lógica pura, no el CSS. Por eso tu cuenta NO cambia: **261/261 en 21 archivos**.

**ACTUALIZADOS (3):**
- `src/features/catalog/components/SearchBar.tsx` — FilterBar rediseñada en una fila
  ([Ordenar][Solo disponibles][Precio máx.][Ver todo]) y chips de categorías retirados.
  El buscador queda EXACTO igual (sugerencias incluidas).
- `src/features/catalog/pages/CatalogPage.tsx` — `?orden=asc|desc` en la URL (el filtro
  sobrevive al compartir/recargar). Quedaron unos envoltorios internos dormidos de la
  cascada: inofensivos, se limpian en ronda futura.
- `src/features/catalog/pages/HomePage.tsx` — NO se vuelve a pegar: conserva tu versión
  actual (fix 5.109 del héroe incluido). Sin acción tuya.

**VUELVE A SU ESTADO ANTERIOR (1):**
- `src/index.css` — se re-pegó SIN el bloque 5.111: queda idéntico a como estaba antes de
  esta ronda. En el `git status` DEJARÁ de aparecer como modificado — es lo correcto, no
  te asustes.

**NO SE TOCAN:** RootLayout (footer «Diseñado por: Erick Simosa · ericksimosa@gmail.com»
intacto), InstalarEnIphone (5.110), index.html, manifest, ProductCard, CategoryCard,
SubcategoryCard, Skeleton, useCatalog, catalog.service, funciones de Netlify, reglas de
Firestore, carrito/pedidos.

## 4) PRUEBA LOCAL ANTES DEL PUSH (netlify dev)

1. `npx netlify dev`
2. En otra terminal: `npm test` → esperado **261/261 en 21 archivos**
   (247 de la 5.110 + 14 de cascada-orden).
3. `npm run build` → VERDE (precache 120; los avisos de chunks grandes son el pendiente
   conocido, material de la próxima tanda de rendimiento).
4. En `http://localhost:8888`:
   - `/` → **las tarjetas de carruseles y bahías aparecen AL INSTANTE, sin cascada**.
   - Buscador del héroe → las sugerencias salen COMPLETAS (fix 5.109 intacto).
   - `/catalogo` → bahías + listado general, todo directo.
   - Entra a una bahía CON subcategorías → SOLO subcategorías (sin chips de categorías).
   - Pulsa una subcategoría → sus productos, al instante.
   - «Ordenar» → «Menor precio» y «Mayor precio» (mira que la lista se acomoda sola).
   - «Solo disponibles» y «Precio máx.» funcionan como siempre.
   - Con algo activo aparece «Ver todo» → un toque y limpia todo.
   - «Cargar más» → las nuevas aparecen de una, sin espera.
   - iPhone: aviso de instalar a ~2 s (5.110).

## 5) Push ÚNICO COMBINADO (3 rondas: 5.109 + 5.110 + 5.111)

Con TODOS los archivos pegados (5.109, 5.110, la 5.111 y este ajuste de la cascada):

```
git rm --cached "respaldos/respaldo-productos-antes-de-normalizar-2026-10-24_001506.json"
git add -A
git status
git commit -m "Rondas 5.109-5.111: llegada rapida (fachada liviana, preload, cache-first /img), fixes (buscador del heroe, Eliminar en categorias), aviso de instalar en iPhone/iPad, tarjeta de WhatsApp con foto (?v=2) y catalogo con ordenar por precio, filtros en una fila y bahias con hijas (estilo app de conveniencia)"
git push
```

En el `git status` intermedio verificar:
- que el JSON de respaldos salga como `D` (sale del repo; la copia local queda a salvo);
- que NI `respaldos/` NI `spot24-para-comparar.txt` salgan en «Changes to be committed»;
- que `index.css` YA NO salga como modificado (volvió a su estado anterior);
- que estén los NUEVOS de la 5.111 (cascada.ts, orden.ts, cascada-orden.test.ts) y de la
  5.110 (instalar.ts, InstalarEnIphone.tsx, instalar-iphone.test.ts);
- que estén los EDITADOS (SearchBar.tsx, CatalogPage.tsx, HomePage.tsx, RootLayout.tsx,
  index.html, vite.config.ts, AdminCategoriesPage.tsx, la fachada y los LEEMEs).

Netlify compila solo y publica en 2-3 min.

## 6) Checklist post-deploy (Netlify publicado)

- [ ] Home: tarjetas de carruseles y bahías AL INSTANTE, sin cascada ni fundidos nuevos.
- [ ] Buscador del héroe: sugerencias completas, sin recorte (fix 5.109 intacto).
- [ ] Catálogo: flujo bahía → subcategoría → tarjetas, todo directo.
- [ ] «Ordenar» menor/mayor precio + «Solo disponibles» + «Precio máx.» + «Ver todo».
- [ ] «Cargar más»: las nuevas aparecen de una, sin espera.
- [ ] iPhone Safari: aviso de instalar a ~2 s, los 3 pasos, la X no vuelve.
- [ ] WhatsApp: compartir `https://spot24express.netlify.app/?v=2` → tarjeta con la fachada.
- [ ] Primera carga rápida (5.109) y 2ª visita aún más rápida (caché de /img).
- [ ] Android: aviso nativo de instalar, sin cambios.
- [ ] Footer intacto en todas las páginas.
