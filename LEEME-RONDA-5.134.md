# Ronda 5.134 — Renombre de líneas de WhatsApp: «Atención al Cliente»

## Lo que pediste

Las dos líneas de WhatsApp quedan así, **sin que nada se rompa**:

| Línea | Antes | Después |
|---|---|---|
| Atención | «Soporte Atención al Cliente» | **«Atención al Cliente»** |
| Ventas | «Soporte de Ventas» | **«Soporte de Ventas»** (sin cambios, como decidiste) |

## Base usada: tu último commit, exacto

Verificado contra tu push más reciente: commit **`1c2f242`** («Rondas 5.124-5.132») de
`github.com/spot24express/spot24`, clonado y trabajado directamente sobre él. Tu VSC solo
difiere de ese commit por los archivos de la 5.133 (imagen al compartir) — **ninguno de los
5 archivos de esta ronda se toca en la 5.133**, así que puedes pegar encima sin conflicto.

## Por qué no puede romper nada

El nombre vive en **un solo punto de verdad**: `lineasWhatsapp()` en `src/shared/lib/whatsapp.ts`.
El globo de RootLayout y el pie de página renderizan `linea.nombre` dinámicamente — no hay
nombres copiados en pantallas. Cambiar esa constante cambia el texto visible en todos lados
a la vez.

**Lo que NO cambió** (garantía):
- Números guardados en Firestore (`whatsappAtencion` / `whatsappVentas`) — **no hay migración
  de datos**; el nombre no vive en la base, vive en el código.
- El rescate automático del campo viejo `whatsappNumber` como línea de atención.
- Enlaces `wa.me`, normalización y la apertura de siempre.
- Mensajes prellenados («Hola SPOT 24, necesito ayuda con mi pedido.» / «…información de un
  producto.») — `MENSAJES_WHATSAPP` intacto.
- Etiquetas cortas del panel («Atención» / «Ventas») — intactas.
- Ni una línea de `functions/` ni de `vite.config.ts` ni de `netlify.toml`.

## Archivos (3 con cambio real + 2 solo comentarios)

1. `src/shared/lib/whatsapp.ts` — `nombre: 'Atención al Cliente'` (era «Soporte Atención al
   Cliente») + comentarios actualizados. **El cambio funcional.**
2. `src/features/admin/pages/AdminSettingsPage.tsx` — etiqueta del campo «WhatsApp Atención
   al Cliente (vacío = línea oculta)», hint, enlace «probar WhatsApp» y comentarios.
3. `src/tests/whatsapp-lineas.test.ts` — los 2 asserts del nombre de atención actualizados
   (siguen siendo 15 pruebas).
4. `src/app/layouts/RootLayout.tsx` — **solo un comentario** (el código no cambia: toma el
   nombre de `lineasWhatsapp()`). Pegarlo es opcional pero recomendado.
5. `src/shared/services/settings.service.ts` — **solo comentarios**. Igual: opcional pero
   recomendado.

`CAMBIOS-5.134.diff` tiene el diff completo por si quieres revisarlo línea por línea.

## Verificación corrida sobre tu commit (antes de entregarte esto)

- `npm test` → **373/373 en 30 archivos** (los mismos que tu VSC hoy).
- `npm run typecheck` → OK.
- `npm run build` → OK, precache 120 entradas.
- `functions/` no se tocó → tus 148 tests de functions siguen siendo válidos.

## Aplicación

1. Pega los 5 archivos (respetando las carpetas).
2. `npm test` → esperado **373/373**. · `npm run build` → OK.
3. Push único → Netlify despliega.

## Prueba en el teléfono

1. El precache cambia (los chunks nuevos) → cierra y abre la PWA **dos veces**.
2. Con los dos números llenos: globo → panel con **«Atención al Cliente»** y «Soporte de
   Ventas» → cada tarjeta abre su chat como siempre.
3. Pie de página: los enlaces muestran el nombre nuevo.
4. `/admin/ajustes` → el campo dice «WhatsApp Atención al Cliente» y el hint «Aparece como
   «Atención al Cliente» en el globo de WhatsApp» → prueba los dos enlaces «probar WhatsApp».
