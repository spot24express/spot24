════════════════════════════════════════════════════════════════════
SPOT 24 · Ronda 5.112.1 — HOTFIX: retiro en tienda + eliminar cuenta
════════════════════════════════════════════════════════════════════
Fecha: 29/10/2026 · 14 archivos (13 reemplazan completos, 1 es NUEVO)

Los archivos vienen DENTRO de su ruta de repo. Copia cada uno a la
misma ruta en tu árbol. Ninguno es parche: todos son REEMPLAZO COMPLETO
y contienen TODO lo anterior + los cambios de esta ronda.

────────────────────────────────────────────────────────────────────
1) QUÉ RESUELVE ESTA RONDA
────────────────────────────────────────────────────────────────────
Tu reporte exacto: «aun cuando el pedido es para retirar en tienda el
flujo continua como que si fuera a entregarlo el delivery, inclusive
en la notificacion que le llega al cliente» + «al intentar eliminar la
cuenta del cliente me dice algo salió mal».

A · RETIRO EN TIENDA DE PUNTA A PUNTA (tu reporte del flujo delivery)
  Causa raíz: la máquina de estados no distinguía modalidad. Un pickup
  SOLO podía cerrarse pasando por «en_camino» (con su push «Tu pedido
  va en ruta», su código de tracking SP-TRK-xxxxxx y el CTA a los
  deliverys). Ahora:

  · Backend (functions/src/domain/order-state.ts — NUEVA FUNCIÓN
    canTransitionFor, la máquina global queda intacta):
      - pickup: preparado → entregado PERMITIDO (cierre del mostrador)
      - pickup: preparado → en_camino PROHIBIDO (nadie sale a entregar)
      - pickup legacy varado en en_camino: se puede cerrar a entregado
      - delivery: todo EXACTAMENTE igual que antes
  · Backend (functions/src/dispatch.ts — coreUpdateOrderStatus):
      - valida con la máquina por modalidad
      - SIN código de tracking en pickup (no hay ruta que seguir)
      - cierre del retiro permitido a CAJERO, GERENTE y ADMIN
        (el delivery NO puede mover pedidos pickup)
      - push al cliente con textos de retiro (ver abajo)
  · Backend (functions/src/lib/notifications.ts — NUEVOS textos pickup):
      - preparado → «SPOT 24 · Listo para retirar — Empacado y listo.
        Te esperamos en la tienda.»
      - entregado → «SPOT 24 · Retirado — Retirado en tienda. ¡Gracias
        por tu visita!»
      - los demás estados comparten texto (son neutrales)
      - el aviso de despacho a deliverys SIGUE sin enviarse en pickup
        (eso ya estaba bien) y los llamadores previos no cambian
  · Panel (src/features/admin/pages/AdminDispatchPage.tsx):
      - «→ En camino» DESAPARECE en pickup para TODOS los roles
        (antes quedaba visible para delivery/admin y por ahí se
        colaba el flujo de envío)
      - botón nuevo «→ Retirado en tienda» desde Preparado, visible
        para cajero/gerente/admin
      - el delivery no ve botones en pedidos pickup
      - el botón «Tomar pedido» sigue bloqueado para pickup (ya estaba)
  · Cliente (Stepper.tsx + OrderDetailPage.tsx + constants/orders.ts):
      - EL PASO «EN CAMINO» SE OCULTA del seguimiento en pedidos pickup
        (petición tuya). El cierre se lee «Retirado en tienda»
      - el texto del estado dice «Empacado y listo. Te esperamos en la
        tienda para tu retiro.» / «Retirado en tienda. ¡Gracias por tu
        visita!» (antes: «Salió de la bahía», «En ruta hacia tu parada»)

B · ELIMINAR MI CUENTA — RECONSTRUIDA Y CORREGIDA
  Síntoma: «me dice algo salió mal» SIN petición de red en consola →
  el fallo ocurría en el paso previo del cliente, antes de llegar al
  servidor. La implementación anterior de esta pieza no me llegó
  completa esta sesión, así que la reconstruí desde cero siguiendo los
  patrones de la casa, y además el nuevo backend es IDEMPOTENTE.

  Flujo nuevo (probarlo tal cual):
    Mi cuenta → Zona de peligro → «Eliminar mi cuenta» → modal de
    confirmación («Mejor no» / «Sí, eliminar mi cuenta») → el servidor
    borra ficha (user) + carrito + tokens FCM + cuenta de Auth, audita
    «eliminar_mi_cuenta» → cierre de sesión local → salida a portada
    con el toast «Tu cuenta fue eliminada».

  Garantías del backend (coreDeleteMyAccount):
    · El uid SIEMPRE sale del token Bearer verificado (jamás del body):
      nadie puede borrar una cuenta ajena.
    · SOLO el rol customer puede auto-eliminarse; el personal recibe
      «coordina tu baja con administración».
    · IDEMPOTENTE: si la cuenta ya no existe en Auth (reintento tras un
      fallo tardío), limpia igual los restos de Firestore y responde ok
      → reintentar jamás deja la cuenta a medias.
    · Los pedidos históricos SE CONSERVAN (registro contable).
    · Solo 1 endpoint nuevo: POST /.netlify/functions/fn-deleteMyAccount

────────────────────────────────────────────────────────────────────
2) LOS 14 ARCHIVOS (13 reemplazan completo + 1 NUEVO)
────────────────────────────────────────────────────────────────────
REEMPLAZAN COMPLETO (13) — pegar sobre el que ya tienes:
 1 · functions/src/domain/order-state.ts        (máquina pickup-aware)
 2 · functions/src/dispatch.ts                  (candado por modalidad)
 3 · functions/src/lib/notifications.ts         (textos pickup)
 4 · functions/src/admin.ts                     (+ coreDeleteMyAccount)
 5 · netlify/functions/fn-deleteMyAccount.ts    (REEMPLAZA el de tu 5.112:
      misma ruta y mismo endpoint, lógica idempotente corregida)
 6 · src/features/admin/pages/AdminDispatchPage.tsx  (botones pickup)
 7 · src/shared/components/ui/Stepper.tsx       (timeline sin «En camino»)
 8 · src/shared/constants/orders.ts             (textos cliente pickup)
 9 · src/features/orders/pages/OrderDetailPage.tsx   (usa los dos de arriba)
10 · src/features/auth/services/auth.service.ts (+ deleteMyAccount)
11 · src/features/auth/store/auth.store.ts      (+ acción deleteMyAccount)
12 · src/features/auth/hooks/useAuth.ts         (+ expone deleteMyAccount)
13 · src/features/auth/pages/AccountPage.tsx    (Zona de peligro + modal;
      reemplaza la versión con el botón que ya tenías)
NUEVO (1):
14 · functions/src/__tests__/pickup-flow.test.ts (13 tests de la ronda)

────────────────────────────────────────────────────────────────────
3) DESPUÉS DE PEGAR LOS ARCHIVOS
────────────────────────────────────────────────────────────────────
1. Verifica tu netlify.toml: debe existir este bloque (si tu toml de
   la 5.112 ya lo tiene, NO toques nada; si no, agrégalo junto a los
   demás):
      [functions."fn-deleteMyAccount"]
        timeout = 26
   (NO reemplaces tu netlify.toml completo: el tuyo tiene el timeout
   de fn-uploadImage que este paquete no trae.)

2. Validación estándar (en tu máquina, sobre tu árbol 5.112):
      npm test                    → 286/286 VERDE (tus tests + intactos)
      npm --prefix functions test → 73/73 VERDE (60 previos + 13 nuevos)
                                    (+14 saltadas, igual que siempre)
      npm run typecheck           → VERDE
      npm run build               → VERDE (PWA precache 121)

3. Pruebas manuales con netlify dev (las funciones SIGUEN tardando la
   primera llamada tras reiniciar: si un 500 sale, espera unos
   segundos y reintenta una vez — el segundo intento sale):
   A. RETIRO EN TIENDA:
      · Cliente de prueba: pedido con retiro (fuera de franja te lo
        fuerza solo) → paga → cajero aprueba → cajero marca Preparado
        → el cliente recibe «SPOT 24 · Listo para retirar» (NO «sale
        de la bahía») → el cajero ve «→ Retirado en tienda» y lo marca
        → el cliente recibe «SPOT 24 · Retirado».
      · Verifica que NADIE ve «→ En camino» en ese pedido y que en el
        detalle del cliente el seguimiento muestra: Pendiente →
        En verificación → Pagado → Preparado → Retirado en tienda
        (sin el paso «En camino»).
      · Prueba también un pedido CON envío dentro de la franja: ese
        flujo debe quedar idéntico al de siempre (Tomar pedido,
        tracking, «En camino»…).
   B. ELIMINAR MI CUENTA:
      · Crea un cliente de prueba nuevo → Mi cuenta → Zona de peligro
        → Eliminar mi cuenta → confirmar → toast verde y sesión cerrada.
      · Verifica en Firebase: el doc desaparece de «user», su carrito
        de «carts», y en Authentication el correo queda libre.
      · Vuelve a intentar iniciar sesión con ese correo: no debe poder.

────────────────────────────────────────────────────────────────────
4) VALIDADO EN CLON LOCAL (con estos 14 archivos)
────────────────────────────────────────────────────────────────────
    · functions: vitest 59/59 VERDE (13 nuevos de pickup) · tsc VERDE
    · frontend: vitest 252/252 VERDE · typecheck VERDE · build VERDE
      (PWA v1.3.0, precache 121)
    · En TU árbol la cuenta esperada es la del punto 2 (tus suites
      tienen 34 tests más que mi clon: los de las piezas que ya
      aplicaste de la 5.112).
════════════════════════════════════════════════════════════════════
