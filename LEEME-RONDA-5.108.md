# Ronda 5.108 — «Vitrina que vende II»

**Fecha:** 27/10/2026 · **Estado:** implementada y validada (typecheck 0 · build ✓ · 216/216 tests)
**Alcance:** las 3 decisiones aprobadas por el dueño en chat. RootLayout y footer NO se tocan.

## 1) Qué entra en esta ronda

### Héroe con la fachada de fondo (Opción A)
- La primera pantalla ahora ES la fachada: foto de fondo (`/img/fachada-spot24.jpg`, la misma de 300 KB que ya estaba en Visítanos) con degradado oscuro (el mismo truco de las fotos del carrusel) para que el texto se lea.
- Encima: la promesa «Tu parada segura. 24/7.» + el buscador. El impacto visual entra de una vez al abrir la app.
- «Visítanos» sube al 2º lugar con el carrusel de promos/fotos (la fachada ya vive en el héroe, no se repite abajo).

### Recién llegados ahora es carrusel
- Pasa de tarjetas estáticas a la misma hilera que avanza sola de «Vuelve a comprar» y «Los más pedidos» (5 s, se pausa al tocar, reanuda a los 10 s).
- Reutiliza el hook `useAutoCarousel` (5.98): 0 lecturas nuevas a Firebase.

### Compartir la app y compartir producto
- **Héroe:** icono «compartir» DISCRETO arriba a la derecha, DENTRO del héroe (la barra superior del teléfono ya está llena — decisión del dueño).
- **Tarjeta de producto:** píldora arriba-izquierda de la foto (la esquina opuesta al «+»; el chip de stock queda abajo-izquierda).
- **Ficha del producto:** botón «Compartir» con etiqueta, debajo del precio.
- Comportamiento: en móvil moderno abre el PANEL NATIVO del teléfono (WhatsApp, Instagram, etc.). En PC copia el enlace y avisa con el toast «Enlace copiado. Pégalo donde quieras.»
- Texto que viaja: «SPOT 24 — Tu parada segura. 24/7. Repuestos, servicios y conveniencia a domicilio» (app) / «Mira esta pieza en SPOT 24: …» + enlace de la ficha (producto).
- Analytics: evento `share` de GA4 (panel_nativo vs copiar_enlace; app vs producto) — sin datos personales (§8.4).

## 2) Archivos de la ronda (7)

**NUEVOS (3):**
- `src/shared/lib/compartir.ts` — lógica de compartir (Web Share API + respaldo copyText + toasts + analytics)
- `src/shared/components/ui/BotonCompartir.tsx` — botón reutilizable (héroe / tarjeta / ficha)
- `src/tests/compartir.test.ts` — 7 tests

**ACTUALIZADOS (4):**
- `src/features/catalog/pages/HomePage.tsx` — héroe con fachada + Visítanos 2º + Recién llegados carrusel
- `src/features/catalog/components/ProductCard.tsx` — compartir en la tarjeta
- `src/features/catalog/pages/ProductPage.tsx` — compartir en la ficha
- `src/shared/lib/analytics.ts` — evento 'share' (GA4)

**NO SE TOCAN:** `RootLayout.tsx` (footer «Diseñado por: Erick Simosa · ericksimosa@gmail.com» intacto), barra superior, legales, carrito.

### 5.108b · Corrección de alturas en las tarjetas (avistada por el dueño en Recién llegados)
- `ProductCard.tsx` (mismo archivo, 3 ajustes de estilo):
  1. `h-full` en la tarjeta → dentro de los carruseles todas ocupan la altura de la más alta de la hilera.
  2. `min-h-10` en el nombre → SIEMPRE reserva el alto de 2 líneas: nombre de 1 línea deja el espacio en blanco y la tarjeta no se encoge.
  3. `mt-auto` en el precio → los precios quedan alineados abajo aunque una tarjeta tenga rating y la otra no.
- Válido también para «También en la bahía» (ficha) y el catálogo.
- Re-validado: build VERDE + 216/216 tests.

### 5.108c · Ajuste de test (detectado en la validación del dueño)
- `src/tests/inventario-pdf.test.ts`: el test «extrae y parsea un PDF REAL…»
  se quedó con el límite global de 5 s y en la PC del dueño (Windows, arranque
  en frío) pdfjs tardó ~7 s → timeout falso. Se le dio timeout propio de 30 s,
  igual que ya tenía su hermano «REGRESIÓN 5.87b» del mismo archivo.
- Es velocidad de máquina, no un bug del importador (en el clon corre en <1 s).
- Tras el parche: 229/229 tests en 19 archivos (216 + 13 de exportar-inventario).

## 3) Validación local del dueño

1. `npm run build` → typecheck 0 errores, ✓ built in ~34 s, precache ~120 entries. Los warnings de chunks >500 kB (firebase-vendor, vendor, jspdf-vendor) SIGUEN siendo conocidos y no bloquean: material de la ronda 5.109 (rendimiento).
2. `npm test` → 216/216 en 18 archivos (209 + 7 nuevos de compartir).
3. `npm run dev` (opcional) y mirar:
   - Héroe: fachada de fondo + buscador + icono compartir arriba-derecha.
   - Visítanos: carrusel de fotos/promos.
   - Recién llegados: hilera que avanza sola.
   - Tarjeta: compartir arriba-izquierda; «+» arriba-derecha; chip de stock abajo-izquierda.
   - Ficha: botón «Compartir» bajo el precio.
   - En PC, tocar compartir → toast «Enlace copiado».

## 4) Push ÚNICO (5.98 → 5.106 + 5.108) — decisión del dueño para ahorrar créditos

```
git add -A
git restore --staged respaldos spot24-para-comparar.txt
git status
git commit -m "Rondas 5.98-5.108: legales, resenas, Exportar PDF, fix vitrina y vitrina II (fachada en heroe, Recien llegados carrusel, compartir app/producto)"
git push
```

En el `git status` intermedio verificar que NI `respaldos/` NI `spot24-para-comparar.txt` salgan en «Changes to be committed». Netlify compila solo (`npm install && npm --prefix functions ci && npm run build`) y publica en 2-3 min.

## 5) Después del push (producción)

- Ctrl+F5 en spot24express.netlify.app.
- Checklist de 2 min: legales (§=0, justificado, footer intacto) · héroe con fachada · Recién llegados carrusel · compartir funciona (móvil: panel nativo / PC: toast) · Exportar PDF admin · reseñas.
- Observar lecturas Firebase 48 h (5.108 no agrega lecturas: comparte datos que ya están en pantalla).

## 6) Próxima parada — ronda 5.109 (rendimiento)

- −30 % lecturas, partir firebase-vendor / vendor / jspdf-vendor (>500 kB), fachada 300→100 KB.
- Plan Spark→Blaze + alerta de presupuesto.
- Auditoría de los 27 avisos de npm (NUNCA `npm audit fix --force`).
