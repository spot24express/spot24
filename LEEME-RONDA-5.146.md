# 5.146 · EL FALLO AL RECARGAR — RE-ENTREGA COMPLETA Y RE-VALIDADA

**Esta entrega REEMPLAZA a la carpeta/ZIP «5.144-recarga-cotizacion».** El código es
el mismo de esa ronda, pero volvió a pasar por todo el proceso de verificación
**montado sobre tu commit actual `804c901` («fix CI y decimales en actualizacion de
precios»)**: auditoría línea a línea de los 12 archivos contra tu commit, batería
completa de pruebas antes y después, y prueba combinada con la ronda 5.145. Usa
ESTE ZIP y descarta el anterior.

---

## Qué resuelve (recordatorio del problema que reportaste)

«No calcula los montos si recargo, en teléfono o en la PC». Era una **carrera de
la recarga** entre el carrito y los ajustes:

1. Al recargar, el carrito no está en memoria: la app arranca con carrito VACÍO y
   el carrito real llega unos instantes después, asincrónicamente.
2. Al mismo tiempo llegan los Ajustes. Si el delivery está **fuera de franja**, el
   checkout vuela solo a RETIRO EN TIENDA y re-lanza la cotización en ese instante.
3. Si el carrito todavía no había llegado, esa corrida veía «carrito vacío», se
   salía sin avisar y **no había nada que la volviera a lanzar**: cotización muerta.
4. Los 3 síntomas eran un solo bug: «Calculando montos exactos…» sin fin, el Pago
   Móvil automático desaparecido y «Esperando los montos exactos para seguir».

Por eso solo fallaba al recargar y fuera de la franja: el vuelo a retiro era la
única re-corrida automática posible, y le ganaba (a veces) la hidratación del
carrito. De regalo, el mismo bug dejaba **sin disparar la reserva de stock de 2 h**
al recargar.

## El arreglo (rondas incluidas: 5.142 + 5.143 + 5.144)

- **Gates de hidratación (5.144)**: el checkout sabe si el carrito ya se restauró
  (`hydrated`) y no corre cotización ni reserva hasta que el carrito real esté en
  memoria; cuando llega, **se disparan solas** (el flag está en las dependencias
  del efecto). La lógica vive en `shared/lib/cotizacion.ts` como funciones puras
  (`debeCotizar` / `debeReservar`), testeables en los dos órdenes de la carrera.
- **Watchdog (5.143)**: si la cotización tarda más de 20 s (45 s en desarrollo),
  la UI pasa a error con botón **Reintentar** — jamás un spinner eterno. Una
  respuesta tardía que llegue después AÚN se acepta (mejor montos tarde que nunca).
- **Hidratación a prueba de fallos (5.144)**: aunque la lectura del carrito falle
  (Firestore caído, JSON corrupto), el flag se marca igual (`finally`) — el
  checkout nunca espera para siempre.
- **Pago Móvil automático, respaldo de cuenta única (5.142)**: si Ajustes perdió
  el teléfono de recaudo pero hay EXACTAMENTE UNA cuenta de pago móvil activa, la
  validación automática funciona con el teléfono de esa cuenta (web y servidor).
  Además, guardar Operación con el suiche apagado ya NO borra el teléfono guardado.
- **Panel de diagnóstico (5.142, solo admin/gerente)**: cuando la validación
  automática no aparece, un panel te dice a TI (el cliente nunca lo ve) cuál
  condición exacta está fallando: teléfonos distintos, cuenta inactiva, forma
  elegida, cotización o tasa.

## ARCHIVOS COMPLETOS (copiar y pegar tal cual, respetando la ruta)

| # | Ruta | Estado |
|---|------|--------|
| 1 | `src/features/checkout/pages/CheckoutPage.tsx` | Reemplaza completo (incluye 5.142 + 5.143 + 5.144) |
| 2 | `src/shared/lib/cotizacion.ts` | NUEVO archivo (watchdog 5.143 + gates 5.144) |
| 3 | `src/features/cart/hooks/useCart.ts` | Reemplaza completo (5.144) |
| 4 | `src/features/auth/hooks/useAuth.ts` | Reemplaza completo (5.144) |
| 5 | `src/shared/lib/pagoMovilAuto.ts` | Reemplaza completo (5.142) |
| 6 | `src/shared/services/settings.service.ts` | Reemplaza completo (5.142) |
| 7 | `src/features/admin/pages/AdminSettingsPage.tsx` | Reemplaza completo (5.142) |
| 8 | `src/tests/cotizacion-hidratacion.test.ts` | NUEVO (tests de esta ronda) |
| 9 | `src/tests/cotizacion-watchdog.test.ts` | NUEVO (tests 5.143) |
| 10 | `src/tests/pago-movil-auto.test.ts` | Reemplaza completo (5.142) |
| 11 | `functions/src/pagoMovil.ts` | Reemplaza completo (5.142) |
| 12 | `functions/src/__tests__/pago-movil-auto.test.ts` | Reemplaza completo (5.142) |

**Importante:** el archivo #1 (CheckoutPage) DEPENDE de los #2 y #5 — copia los 12
de una vez. Como NO aplicaste la 5.142/5.143 antes, no hay atajo: los 12.

**Compatibilidad con la 5.145 (existencias del importador):** los archivos de esta
entrega y los de la 5.145 **no comparten ni un archivo** — puedes aplicar ambas en
el mismo push sin conflicto (verificado: la suite completa combinada queda en verde).

## Verificación de ESTA re-entrega (todo sobre tu commit `804c901`)

Árbol limpio clonado exactamente en tu último commit, con `npm ci` fresco:

1. **Antes de tocar nada (baseline de tu commit):** 407/407 tests web, 201 + 14
   saltados en functions, `tsc --noEmit` sin errores, `eslint .` sin errores,
   `npm run build` de producción OK.
2. **Auditoría de los 12 archivos contra tu commit:** delta quirúrgico completo de
   **+381 / −33 líneas en 9 archivos modificados + 3 archivos nuevos (371 líneas)**.
   Ningún cambio fuera de la ronda: nada de tu código actual se revierte ni se pierde.
3. **Después de montar la ronda:** **433/433 tests web** (407 + 26 nuevos: 13 de
   hidratación, 7 de watchdog, 6 de respaldo de cuenta única), **208 + 14 saltados
   en functions** (201 + 7 nuevos), `tsc --noEmit` web y de functions sin errores,
   `eslint .` sin errores y `npm run build` OK.
4. **Prueba combinada 5.146 + 5.145 en el mismo árbol:** **448/448 tests web**,
   208 + 14 saltados en functions, typecheck/lint/build/tsc de functions en verde.
   Puedes aplicar ambas rondas juntas con confianza.

## Cómo probarlo tú (2 minutos, en producción)

1. Publica y abre el checkout **fuera de la franja del delivery**.
2. **Recarga** la página (F5 en PC; en el teléfono cierra la pestaña y ábrela de nuevo).
3. Debe pasar, sin cuelgue: aviso de horario → cambia a RETIRO EN TIENDA →
   los montos se calculan solos en segundos → el Pago Móvil automático reaparece
   con su formulario → puedes confirmar el pedido.
4. Repite la recarga un par de veces: el resultado ya no depende del orden de
   llegada; si el carrito llega tarde, la cotización se re-lanza sola.
5. Con sesión de admin/gerente, si la validación automática no apareciera por
   configuración, verás el panel «Diagnóstico · Validación automática BDV» que
   dice exactamente qué ajustar.
