════════════════════════════════════════════════════════════════════
SPOT 24 · Ronda 5.112.2 — HOTFIX: entrega multi-producto (transacción)
════════════════════════════════════════════════════════════════════
Fecha: 29/10/2026 · 15 archivos (14 reemplazan completos, 1 es NUEVO)

Los archivos vienen DENTRO de su ruta de repo. Copia cada uno a la
misma ruta en tu árbol. Ninguno es parche: todos son REEMPLAZO COMPLETO.

Si ya pegaste los 14 de la 5.112.1: solo 2 archivos cambian de verdad
(dispatch.ts y 1 test nuevo). Los otros 13 vienen otra vez IDÉNTICOS
para que este paquete baste solo y tu árbol quede consistente.

────────────────────────────────────────────────────────────────────
1) QUÉ RESUELVE ESTA RONDA
────────────────────────────────────────────────────────────────────
Tu reporte: «si puede eliminar la cuenta / pero tuve problemas en
admin», con el terminal mostrando:

   [internal] Error - Firestore transactions require all reads to be
   executed before all writes.   … dispatch.ts:151 → coreUpdateOrderStatus

A · EL BUG REAL DE LA ENTREGA (no era el entorno esta vez)
  Qué pasaba: al marcar un pedido ENTREGADO, la transacción que suma el
  contador «más pedidos» (vendidosTotal, ronda 5.98) recorría los
  productos intercalando leer→escribir→leer→escribir. Firestore EXIGE
  todas las lecturas antes de cualquier escritura dentro de una
  transacción: con 2 o más productos DISTINTOS, la segunda lectura
  llegaba después de la primera escritura → rechazo → 500 SIEMPRE.

  Por qué a veces sí pasaba: con UN solo producto distinto no hay
  segunda lectura → funciona. Por eso de tus 5 intentos uno volvió 200
  y los demás 500: el fallo era determinista por pedido, no por suerte.

  Impacto: TODA entrega de un pedido de 2+ productos, fuera retiro o
  envío. No era solo local: en producción habría fallado igual. La
  cancelación y el rechazo de pago (que reponen stock) YA respetaban
  la regla; esta era la única transacción infractora del backend.

  Fix (functions/src/dispatch.ts): primero se leen TODOS los productos
  (una sola tanda) y DESPUÉS se escriben TODOS los contadores + estado
  + evento. Mismo criterio que ya aplicaba cancelOrder.

  Regresión (functions/src/__tests__/dispatch-transaction.test.ts —
  NUEVO): 8 tests con una transacción ESTRICTA que revienta con el
  MISMO mensaje que viste si alguien vuelve a leer tras escribir.
  Cubre: entrega pickup y delivery multi-producto, entrega de un solo
  producto, en_camino con tracking, retiro que jamás pasa por
  en_camino, replay idempotente, cajero SÍ cierra retiro y delivery NO.

B · TU SESIÓN, PIEZA POR PIEZA (lo que NO era bug)
  · ELIMINAR CUENTA: FUNCIONÓ. Tu propio terminal lo muestra:
    «fn-deleteMyAccount → Response with status 200 in 20526 ms». Los
    20 s son el arranque en frío de siempre en netlify dev. No hay
    nada que arreglar (la reconstrucción idempotente de la 5.112.1
    quedó bien).
  · Los 500 en fn-reserveStock / fn-quoteTotals / fn-createOrder /
    fn-verifyPayment que viste en la 5.112: siguen siendo el artefacto
    del arranque en frío (timeout 30 s de lambda-local, el reintento
    sale). Cómo distinguirlos de un bug real en el terminal: si el
    error dice «Task timed out after 30.00 seconds» = entorno
    (reintenta y pasa); si dice OTRO error concreto = bug real (como
    pasó esta vez con la transacción).
  · El 400 de signIn (auth/invalid-credential) al final de tu consola:
    es Firebase rechazando credenciales. Si fue iniciar sesión con el
    cliente de prueba que YA ELIMINASTE, es lo esperado (la cuenta ya
    no existe). Si fue tu admin, revisa contraseña/mayúsculas.

C · TU PEDIDO DE PRUEBA QUEDÓ VARADO
  Si SP-261029-0007 quedó en en_camino de los intentos fallidos: con
  este paquete el botón «→ Retirado en tienda» (cajero/gerente/admin)
  lo cierra sin drama, o «Cancelar» si prefieres descartarlo.

────────────────────────────────────────────────────────────────────
2) LOS 15 ARCHIVOS (14 reemplazan completo + 1 NUEVO)
────────────────────────────────────────────────────────────────────
REEMPLAZAN COMPLETO (14):
 1 · functions/src/dispatch.ts        ★ EL CAMBIO REAL: fix de la
        transacción + candado pickup de la 5.112.1 (todo junto)
 2 · functions/src/domain/order-state.ts        (máquina pickup-aware)
 3 · functions/src/lib/notifications.ts         (textos pickup)
 4 · functions/src/admin.ts                     (+ coreDeleteMyAccount)
 5 · netlify/functions/fn-deleteMyAccount.ts    (idempotente, 5.112.1)
 6 · src/features/admin/pages/AdminDispatchPage.tsx   (botones pickup)
 7 · src/shared/components/ui/Stepper.tsx       (timeline sin «En camino»)
 8 · src/shared/constants/orders.ts             (textos cliente pickup)
 9 · src/features/orders/pages/OrderDetailPage.tsx
10 · src/features/auth/services/auth.service.ts (+ deleteMyAccount)
11 · src/features/auth/store/auth.store.ts      (+ acción)
12 · src/features/auth/hooks/useAuth.ts         (+ expone)
13 · src/features/auth/pages/AccountPage.tsx    (Zona de peligro + modal)
14 · functions/src/__tests__/pickup-flow.test.ts (13 tests, 5.112.1)
NUEVO (1):
15 · functions/src/__tests__/dispatch-transaction.test.ts
      (8 tests de regresión de la transacción — el que hubiera
      atrapado este bug antes de llegar a tu terminal)

────────────────────────────────────────────────────────────────────
3) DESPUÉS DE PEGAR LOS ARCHIVOS
────────────────────────────────────────────────────────────────────
1. Validación estándar (en tu máquina, sobre tu árbol):
      npm --prefix functions test → 81/81 VERDE (73 de tu árbol + 8
                                    nuevos) (+14 saltadas, igual que siempre)
      npm test                    → 286/286 VERDE (sin cambios)
      npm run typecheck           → VERDE
      npm run build               → VERDE (PWA v1.3.0, precache 121)

2. Pruebas manuales con netlify dev (REINICIA netlify dev antes, para
   que cargue el dispatch.ts nuevo):
   A. ENTREGA MULTI-PRODUCTO (el bug de esta ronda):
      · Pedido con 2 o 3 productos DISTINTOS → retiro en tienda.
      · Cajero: Verificar → Preparado → «→ Retirado en tienda».
      · Debe pasar a la PRIMERA (si es la primera llamada tras
        reiniciar y tarda, reintenta 1 vez: 30 s del entorno).
      · En /admin (Panel/Métricas) el contador «Los más pedidos» de
        cada producto debe subir con las unidades entregadas.
      · Repite con un pedido CON ENVÍO de 2+ productos: Tomar pedido
        (delivery) → Entregado por el delivery → también debe pasar.
   B. REGRESIÓN RETIRO (lo de la 5.112.1, rápido):
      · Cliente recibe «Listo para retirar» / «Retirado en tienda»
        (nunca «va en ruta»), seguimiento SIN el paso «En camino»,
        sin código de tracking, y el delivery no ve botones.
   C. REGRESIÓN ENVÍO: un pedido de domicilio de 1 producto, flujo de
      siempre intacto.
   D. (Opcional) Eliminar cuenta de un cliente de prueba nuevo:
      confirma el 200 rápido con la función caliente.

────────────────────────────────────────────────────────────────────
4) VALIDADO EN CLON LOCAL (con estos 15 archivos)
────────────────────────────────────────────────────────────────────
    · functions: vitest 67/67 VERDE (8 nuevos de transacción + 13 de
      pickup) · tsc VERDE
    · frontend: vitest 252/252 VERDE · typecheck VERDE · build VERDE
      (PWA v1.3.0, precache 121)
    · En TU árbol las cuentas esperadas son las del punto 3 (tus
      suites tienen 34 tests de frontend y 14 de functions más que mi
      clon: piezas de la 5.112 que ya aplicaste tú).
════════════════════════════════════════════════════════════════════
