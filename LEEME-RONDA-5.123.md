# Ronda 5.123 · Barrido completo: «pieza» → «artículo»

## Qué es

Mismo criterio de la 5.120 (buscador): el dueño pidió que la tienda diga
«artículo» y no «pieza». Esta ronda unifica TODOS los textos visibles, más
un subtítulo puntual que reportó el dueño («Vuelve a comprar»).

## Los textos que cambian

**Tienda:**
- Home, sección «Vuelve a comprar»: «Tus **artículos** de siempre, a un toque.»
- Home, misma sección (texto para lectores de pantalla): «Artículos que ya
  compraste».
- Compartir por WhatsApp (ficha y tarjeta de producto): «Mira **este
  artículo** en SPOT 24: …»
- Avisos del carrito: «Ya tienes el tope disponible de **este artículo** en
  el carrito.» / «No pudimos agregar **el artículo**. Intenta de nuevo.»
- Reseñas (4 textos): «…compraron y recibieron **este artículo**», «Ya
  dejaste tu reseña de **este artículo**. ¡Gracias!», «¿Cómo te fue con
  **el artículo**? (máx. 400 letras)», «(solo **artículos** comprados y
  recibidos)».

**Errores del backend (los muestra la app):**
- «**Ese artículo** ya no existe.»
- «Ya dejaste tu reseña de **este artículo**. ¡Gracias!» (idéntico al de la
  pantalla, para que nunca difieran)
- «Solo puedes reseñar **artículos** que compraste y ya recibiste.»

**Términos y Condiciones (6 párrafos, con concordancia ajustada):**
- «los **artículos** reales pueden variar en presentación…»
- «…o **un artículo** imposible de surtir…»
- «…al instalar o usar **el artículo**.»
- «…la devolución física **del artículo** para inspección.»
- «Los **artículos** eléctricos y electrónicos (…puede dañar**los**…)»
- «…instalación de **artículos** realizada por talleres o terceros…»

## Archivos a copiar (destino exacto en el repo)

| # | Archivo | Destino |
|---|---------|---------|
| 1 | `HomePage.tsx` | `src/features/catalog/pages/HomePage.tsx` |
| 2 | `ProductPage.tsx` | `src/features/catalog/pages/ProductPage.tsx` |
| 3 | `ProductCard.tsx` | `src/features/catalog/components/ProductCard.tsx` |
| 4 | `ResenasProducto.tsx` | `src/features/catalog/components/ResenasProducto.tsx` |
| 5 | `TerminosPage.tsx` | `src/features/legal/pages/TerminosPage.tsx` |
| 6 | `reviews.ts` | `functions/src/reviews.ts` |
| 7 | `compartir.test.ts` | `src/tests/compartir.test.ts` |

## Notas

- Todo sale en el MISMO push a `main`: el archivo `reviews.ts` es el core que
  reutilizan las Netlify Functions — no hace falta deploy aparte.
- Quedaron menciones de «pieza» SOLO en comentarios de código y nombres de
  pruebas (no los ve ningún cliente).
- No se tocó ninguna palabra en nombres de productos ni en el catálogo: es
  solo texto de interfaz.

## Verificación

- `npm test` → **340/340** ✓
- `npm run build` ✓
- `npm --prefix functions run build` ✓
- `npm --prefix functions test` → **128/128** ✓
