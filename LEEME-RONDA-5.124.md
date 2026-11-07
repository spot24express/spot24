# SPOT 24 · Ronda 5.124 — Eliminar productos (arreglado) + imagen al compartir

**Fecha:** 5 de noviembre de 2026 · **Estado:** baterías verdes (344/344 web · 135/135 backend + 14 skipped normal · builds limpios)

> **⚠️ VERSIÓN CORREGIDA (5.124-r2):** la primera entrega de esta ronda traía
> `ProductCard.tsx` y `ProductPage.tsx` construidos sobre una base vieja — pegarlos
> BORRABA dos cambios de la ronda 5.120 (texto de nombre y precio más pequeños en
> móvil, y la nota «Precios no incluyen IVA» en tarjeta y ficha). Si ya pegaste esa
> versión, vuelve a pegar los 3 archivos visuales de ESTA carpeta (`ProductCard.tsx`,
> `ProductPage.tsx`, `HomePage.tsx`) y NO pegues `brand.ts`. Esta versión conserva
> TODO: se verificó línea por línea contra el push `551c3f7` — los 3 archivos
> visuales ahora son «tu archivo + 1 línea» (la foto al compartir), cero pérdidas.

Esta ronda resuelve EXACTAMENTE tus dos pedidos:

1. **Eliminar productos** — ni admin ni gerente podían: «le da falla».
2. **Que salga la imagen al compartir** — la foto no salía al compartir desde el home.

---

## ⚠️ ANTES DE PEGAR: empuja primero lo que tienes pendiente

En tu PC tienes **sin empujar** las rondas 5.122 (traspaso de notificaciones por turno) y 5.123
(barrido «pieza»→«artículo»). Empújalas primero (un solo paso, incluye las funciones nuevas):

```
git add -A
git commit -m "Rondas 5.120-5.123: cola de despacho e IVA sobre base en Bs, traspaso de notificaciones por turno y barrido pieza->articulo"
git push
```

Después pega los archivos de esta ronda (lista abajo) y empuja de nuevo.
**No pasa nada si los pegas antes:** los archivos que se pisan ya traen incorporados
los textos de la 5.123 — quedan consistentes en cualquier orden.

---

## RUTAS — dónde pegar cada archivo (carpeta `spot24-ronda-5.124/`)

### Archivos NUEVOS (solo cópyalos a la ruta; no existen en tu repo)

| # | Archivo de esta carpeta | Pégalo en (desde la raíz del repo) |
|---|---|---|
| 1 | `functions/src/productDelete.ts` | `functions/src/productDelete.ts` |
| 2 | `functions/src/__tests__/product-delete.test.ts` | `functions/src/__tests__/product-delete.test.ts` |
| 3 | `netlify/functions/fn-deleteProduct.ts` | `netlify/functions/fn-deleteProduct.ts` |

### Archivos que REEMPLAZAN los tuyos (mismos nombres)

| # | Archivo de esta carpeta | Pégalo en (desde la raíz del repo) |
|---|---|---|
| 4 | `src/features/admin/services/admin.service.ts` | `src/features/admin/services/admin.service.ts` |
| 5 | `src/shared/lib/compartir.ts` | `src/shared/lib/compartir.ts` |
| 6 | `src/shared/components/ui/BotonCompartir.tsx` | `src/shared/components/ui/BotonCompartir.tsx` |
| 7 | `src/features/catalog/pages/HomePage.tsx` | `src/features/catalog/pages/HomePage.tsx` |
| 8 | `src/features/catalog/pages/ProductPage.tsx` | `src/features/catalog/pages/ProductPage.tsx` |
| 9 | `src/features/catalog/components/ProductCard.tsx` | `src/features/catalog/components/ProductCard.tsx` |
| 10 | `src/tests/compartir.test.ts` | `src/tests/compartir.test.ts` |

**`brand.ts` YA NO se pega:** tu push (`551c3f7`) ya trae el texto correcto
(«No encontramos ese artículo», barrido 5.123). El que venía en la primera
ejecución de esta ronda solo borraba dos comentarios.

Después de pegar:

```
npm test        → 344/344
npm run build   → OK
npm --prefix functions run build   → OK
npm --prefix functions test        → 135/135 (14 skipped normal)
git add -A
git commit -m "Ronda 5.124: eliminar productos (admin y gerente) via fn-deleteProduct + imagen al compartir"
git push
```

El push despliega TODO, incluidas las 2 funciones Netlify nuevas
(`fn-deleteProduct`, y `fn-transferDeviceTokens` si aún no estaba). **No hay que
desplegar reglas de Firestore ni correr `deploy:firebase`.**

---

## 1 · Eliminar productos — por qué fallaba y qué cambió

**CAUSA RAÍZ (doble), estaba en las reglas de Firestore:**

- `products`: `allow delete: if isAdmin()` → el **gerente** quedaba fuera de una vez.
- `variants/{id}`: `allow write` con validaciones sobre `request.resource.data`
  — **que en un DELETE no existe** → la condición da falso → **nadie** podía borrar variantes.
  Como el borrado es un lote atómico (variantes + ficha, 5.92c), SIEMPRE abortaba:
  de ahí el «le da falla» para admin Y gerente.

**SOLUCIÓN (sin tocar reglas y sin despliegue extra):** el borrado ahora pasa por la
Netlify Function **`fn-deleteProduct`** (Admin SDK, inmune a las reglas del cliente):

- Rol verificado EN EL SERVIDOR: **admin y gerente** pueden eliminar (el uid viene
  del Bearer, jamás del body).
- Borra TODO en lote(s): todas las variantes + la ficha (mismo criterio 5.92c).
- **Blindaje:** si el artículo tiene carritos en checkout (reserva activa, viven 2 h)
  se rechaza con mensaje claro: «Este artículo tiene carritos en checkout…».
- **Idempotente:** borrar dos veces no es error (doble clic, reintento).
- Deja registro en `auditLog` (`producto_eliminado`, con nombre y nº de variantes).
- En el panel no cambia NADA: mismo botón «Eliminar» con su confirmación.

## 2 · Imagen al compartir — qué cambió

**Web Share API Level 2:** si el teléfono sabe compartir archivos, la app baja la foto
y la manda en el panel: **WhatsApp la entrega como imagen + texto**.

- **Tarjeta (Home y catálogo):** viaja la FOTO del artículo (la portada, la misma que
  ves en la tarjeta). «Compartir» en el héroe del Home: viaja la portada de marca
  (`/og-cover.jpg`, la misma de las vistas previas de los enlaces).
- **Ficha:** viaja la primera foto del artículo.
- El enlace SIEMPRE viaja: con foto va **dentro del texto** (algunos destinos ignoran
  el campo url cuando hay archivos), sin foto va como siempre.
- A prueba de todo: si la foto no se puede bajar (sin CORS, offline, placeholder svg,
  peso >5 MB) se comparte como siempre — **el botón jamás se rompe por la imagen**.
- Placeholder svg → sin foto adjunta (WhatsApp no acepta svg); se comparte texto+enlace.
- En PC (sin panel nativo) todo sigue igual: copia el enlace + toast.

## Notas

- El «No encontramos ese artículo» de `brand.ts` ya llegó con tu push (barrido 5.123)
  — por eso esta carpeta ya NO lo trae: no queda nada que cambiar allí.
- Los textos visibles restantes con «pieza» son comentarios internos de código
  (no los ve ningún cliente).
- Vista previa del ENLACE en WhatsApp (la cajita con imagen que sale al pegar un link):
  esa la genera el servidor al leer la página; sigue mostrando la portada de marca.
  Que muestre LA FOTO DE CADA ARTÍCULO requiere una Edge Function que reescriba el
  HTML por producto — si la quieres, la hacemos en otra ronda (no rompe nada, es
  independiente).

## Respaldo (NO pegar)

`respaldo-5.122-y-5.123/` contiene copia de los archivos de las rondas 5.122 y 5.123
(traspaso de notificaciones + barrido «artículo»). **Ya los tienes verificados en tu
PC y mandan los tuyos** — solo úsalos si los pierdes.
