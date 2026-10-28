# Ronda 5.109 — «Llegada rápida y pulidos»

**Fecha:** 27/10/2026 · **Estado:** implementada y validada (typecheck 0 · build ✓ · 229/229 tests)
**Alcance:** los 3 hallazgos del dueño tras el deploy de la 5.108. RootLayout y footer NO se tocan.

## 1) Qué entra en esta ronda

### Hallazgo 1 · Primera carga lenta (teléfono y PC)
- **Causa:** la fachada del héroe pesaba 297 KB y el navegador no empezaba a bajarla hasta que React la pedía; además, la conexión hacia las fotos externas (imgbb) se abría tarde.
- **Fix 1 — Fachada adelgazada:** misma foto, mismas medidas (1367×768): 297 → **155 KB** (JPEG progresivo, calidad 76). A simple vista es idéntica.
- **Fix 2 — Preload prioritario (`index.html`):** la fachada se marca como descarga urgente (`fetchpriority="high"`), así su bajada arranca de una vez. Y un `preconnect` a i.ibb.co calienta la conexión hacia las fotos externas ANTES de que haga falta.
- **Fix 3 — Memoria de fotos locales (`vite.config.ts`):** el service worker ahora guarda en el teléfono todo lo que vive en `/img/` (fachada, iconos, fotos locales): hasta 60 archivos, 30 días. La primera visita baja todo; de la segunda en adelante sale del teléfono, sin esperar internet.

### Hallazgo 2 · El buscador del home no mostraba la lista completa
- **Causa:** el section del héroe tenía `overflow-hidden` (necesario para redondear la fachada) y recortaba TODO lo que saliera hacia abajo, incluidas las sugerencias del buscador.
- **Fix (`HomePage.tsx`):** el recorte vive ahora SOLO en una capa interna (foto + degradado). Las sugerencias del buscador pasan por encima, completas y con su scroll.

### Hallazgo 3 · «Eliminar» se desbordaba en las subcategorías (admin)
- **Causa:** la fila de acciones de cada tarjeta no podía bajar de línea; en subcategorías (que además van corridas a la derecha) no cabía en pantallas chicas.
- **Fix (`AdminCategoriesPage.tsx`):** `flex-wrap` en la fila → lo que no cabe baja a una 2ª línea DENTRO de la tarjeta. `justify-end` mantiene los botones a la derecha.

## 2) Archivos de la ronda (5 + 1 retiro)

**ACTUALIZADOS (5):**
- `public/img/fachada-spot24.jpg` — 297 → 155 KB (misma foto, misma medida)
- `src/features/catalog/pages/HomePage.tsx` — recorte solo en la capa visual; buscador libre
- `src/features/admin/pages/AdminCategoriesPage.tsx` — fila de acciones con flex-wrap
- `index.html` — preload de la fachada (prioridad alta) + preconnect/dns-prefetch a imgbb
- `vite.config.ts` — caché CacheFirst de `/img/` en el service worker (`spot24-local-images`)

**RETIRO del repo (1):**
- `respaldos/respaldo-productos-antes-de-normalizar-2026-10-24_001506.json` — quedó rastreado antes de la regla del .gitignore (el gitignore no des-rastrea lo viejo). Sale del repo con `git rm --cached`. La copia local NO se borra (es el seguro del dueño). Sin credenciales, pero si el repo fuera público quedarían a la vista precios/stock → se retira ya, sepa privado o público.

**NO SE TOCAN:** `RootLayout.tsx` (footer «Diseñado por: Erick Simosa · ericksimosa@gmail.com» intacto), `respaldos/` local, `spot24-para-comparar.txt`, carrito/pedidos.

## 3) Validación

1. `npm run build` → typecheck 0 errores, build VERDE.
2. `npm test` → 229/229 en 19 archivos.
3. El `sw.js` generado contiene la caché nueva `spot24-local-images` y el `index.html` sale con el preload de la fachada.

## 4) Push ÚNICO

Con el ZIP extraído sobre la carpeta del proyecto (pone la fachada y este LEEME en su sitio) y los archivos de los Turnos 1 y 2 ya pegados:

```
git rm --cached "respaldos/respaldo-productos-antes-de-normalizar-2026-10-24_001506.json"
git add -A
git status
git commit -m "Ronda 5.109: llegada rapida (fachada liviana, preload, cache-first /img) y fixes (buscador del heroe, Eliminar en categorias)"
git push
```

En el `git status` intermedio verificar:
- que NI `respaldos/` NI `spot24-para-comparar.txt` salgan en «Changes to be committed»;
- que el JSON retirado aparezca como `deleted` (sale del repo; la copia local queda a salvo).

Netlify compila solo y publica en 2-3 min.

## 5) Después del push (producción)

- Ctrl+F5 en PC; en el teléfono cerrar y reabrir la app (si algo no cambia, una vez más: el service worker nuevo llega en ese segundo arranque).
- Checklist de 2 min: buscador del home muestra la lista completa de sugerencias · admin → Categorías → «Eliminar» sin desborde (mirar en subcategorías) · primera carga más rápida · la 2ª visita aún más rápida (caché de fotos) · footer intacto.
- El recorte de los chunks pesados (firebase-vendor / vendor / jspdf-vendor >500 kB) sigue siendo material de la próxima tanda de la 5.109.
