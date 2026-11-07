# Ronda 5.132 — Dos líneas de WhatsApp sobre tu producción, sin cambiar NADA de cómo se abre

## Lo que pediste

Tu número de soporte actual pasa a llamarse **«Soporte Atención al Cliente»** y se agrega un segundo número **«Soporte de Ventas»** — manteniendo la app funcionando **exactamente igual que producción** (sin pantallas blancas, sin rectángulos, sin nada raro).

Base usada: **tus propios archivos de VSC** (los 6 que me pasaste — verificados byte a byte contra tu push más reciente; coinciden al 100 %).

## Matriz de paridad (verificada programáticamente contra tu producción)

| Caso | Producción hoy | Con la 5.132 |
|---|---|---|
| Solo tu número actual | Botón verde abajo-derecha → `wa.me` | **Idéntico**: mismas 19 clases CSS, mismo enlace `wa.me`, misma apertura de siempre |
| Sin números guardados | Botón oculto | Idéntico: oculto |
| Pie de página con 1 número | «Escríbenos por WhatsApp» | Idéntico: mismas clases y texto |
| Dos números llenos | — | El MISMO globo despliega un panel con «Soporte Atención al Cliente» y «Soporte de Ventas»; cada tarjeta abre SU chat por la misma vía `wa.me` |
| Pie de página con 2 números | — | Dos enlaces, uno por línea, con su nombre |
| Ajustes | 1 campo «WhatsApp de soporte» | 2 campos: «WhatsApp Soporte Atención al Cliente» (ya trae tu número) y «WhatsApp Soporte de Ventas» |
| Enlaces | `wa.me` | `wa.me` — la lógica de normalización quedó **byte a byte** igual que producción (verificada) |

**Cero rastro de `intent://` ni experimentos**: la apertura es la de producción de siempre (toque → la carga breve de siempre → WhatsApp).

## La ÚNICA diferencia deliberada (aprobada por ti)

El mensaje prellenado del chat por línea:
- **Soporte Atención al Cliente** → «Hola SPOT 24, necesito ayuda con mi pedido.»
- **Soporte de Ventas** → «Hola SPOT 24, quiero información de un producto.»

(Antes el botón único prellenaba «Hola SPOT 24, tengo una consulta sobre mi pedido.» — si prefieres conservar ese para Atención, es un cambio de 1 línea, dímelo.)

## Tu número actual no se pierde

El campo viejo `whatsappNumber` de Firestore se **rescata automáticamente** como «Soporte Atención al Cliente»: no hay que migrar datos ni reescribir el número. Al guardar Ajustes, el documento queda con los campos nuevos (`whatsappAtencion` / `whatsappVentas`).

## Archivos (4 reemplazos + 1 nuevo)

1. `src/shared/lib/whatsapp.ts` — REEMPLAZO. `waHref` intacto + `lineasWhatsapp()` (Atención primero; línea vacía o mala = oculta; 0 líneas = sin globo).
2. `src/shared/services/settings.service.ts` — REEMPLAZO. Campos `whatsappAtencion`/`whatsappVentas` con respaldo del campo viejo.
3. `src/app/layouts/RootLayout.tsx` — REEMPLAZO. Globo: 1 línea = botón de producción; 2 líneas = panel con cierre diferido (las tarjetas abren el chat sin cortarse).
4. `src/features/admin/pages/AdminSettingsPage.tsx` — REEMPLAZO. Los dos campos con validación y sus enlaces «probar WhatsApp».
5. `src/tests/whatsapp-lineas.test.ts` — NUEVO. 15 pruebas (normalización `wa.me` + las dos líneas).

## Validación corrida sobre tu base (antes de entregarte esto)

- `npm test` → **355/355 en 29 archivos** (tu base trae 340; esta ronda suma 15).
- `npm run typecheck` → OK. · `npm run lint` → **0 errores** (10 warnings preexistentes de siempre).
- `npm run build` → OK, precache 120 entradas.
- Matriz de paridad de arriba verificada por script contra tu commit de producción.

## Aplicación

1. Pega los 5 archivos (respetando las carpetas).
2. `npm test` → esperado 355/355. · `npm run build` → OK.
3. Push único → Netlify despliega.

## Prueba en el teléfono

1. Cierra la PWA y ábrela **dos veces** (el service worker entrega la versión nueva a la segunda apertura).
2. Con tu número de siempre: el botón se comporta **exactamente igual que hoy**.
3. En `/admin/ajustes` → escribe el número de «Soporte de Ventas» → «Guardar operación» → prueba los dos enlaces «probar WhatsApp».
4. Con los dos números: globo → panel con las dos opciones → cada una abre su chat, con la misma apertura de siempre.
