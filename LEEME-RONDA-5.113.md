════════════════════════════════════════════════════════════════════
SPOT 24 · Ronda 5.113 — PAGO MÓVIL AUTOMÁTICO (Validación BDV)
════════════════════════════════════════════════════════════════════
Fecha: 29/10/2026 · 18 archivos (10 reemplazan completos, 8 son NUEVOS)

REGLA DE ORO DE ESTA RONDA: todo arranca APAGADO. Hasta que tú actives
el suiche en Ajustes, la app se comporta EXACTAMENTE igual que hoy
(comprobante + verificación del cajero). Nada de lo que funciona se toca.

────────────────────────────────────────────────────────────────────
1) QUÉ RESUELVE ESTA RONDA
────────────────────────────────────────────────────────────────────
Tu pedido: «que el pago móvil se valide solo y cuando el cajero prepare
el pedido le dé al botón preparado, pero el pago ya estaría confirmado,
y el cliente informado de que su pago está confirmado».

Cómo quedó:
· El cliente paga el monto exacto → toca «Validar mi pago» → la app le
  pregunta al API Conciliación BDV (getMovement, manual MDU-006) → si el
  banco confirma, el pedido nace DIRECTO «pagado» (máquina existente:
  en_verificacion → pagado → preparado; cero estados nuevos).
· El cliente recibe el push «SPOT 24 · Pago confirmado» en el momento
  de la confirmación (el mismo texto que ya usaba la verificación manual).
· El cajero NO verifica nada: el pedido entra derecho a la cola de
  preparación y él solo marca Preparado (como ya hacía).
· SIN comprobante que subir en el camino normal (el banco es la prueba).
· Faltante tipo PedidosYa: si pagó menos, la app le dice cuánto falta
  y pide validar la nueva referencia (hasta 3 pagos parciales). Si pagó
  de más, el panel le muestra al cajero el vuelto a entregar.
· Referencia completa: el conciliador busca el movimiento completo, así
  que en automático se piden TODOS los dígitos (no los últimos 6).
· Una referencia valida UNA sola vez (candado en Firestore: pagoRefs)
  y solo la puede cobrar el uid que la validó.
· Red de emergencia intacta: BDV caído / pago raro → el botón «Prefiero
  subir mi comprobante (revisión manual)» muestra el camino de siempre.

────────────────────────────────────────────────────────────────────
2) ARCHIVOS DE LA RONDA (cada uno a SU misma ruta en tu árbol)
────────────────────────────────────────────────────────────────────
NUEVOS (8):
  functions/src/lib/bdv.ts
  functions/src/pagoMovil.ts
  netlify/functions/fn-checkPagoMovil.ts
  functions/src/__tests__/bdv.test.ts
  functions/src/__tests__/pago-movil-auto.test.ts
  functions/src/__tests__/orders-pago-bdv.test.ts
  src/shared/lib/pagoMovilAuto.ts
  src/tests/pago-movil-auto.test.ts

REEMPLAZOS COMPLETOS (10):
  functions/src/orders.ts
  netlify.toml
  src/shared/services/settings.service.ts
  src/features/checkout/services/checkout.service.ts
  src/features/checkout/types/index.ts
  src/features/checkout/pages/CheckoutPage.tsx
  src/features/admin/pages/AdminSettingsPage.tsx
  src/features/admin/pages/AdminPaymentsPage.tsx
  src/features/orders/types/index.ts
  src/features/orders/pages/OrderDetailPage.tsx

Los 18 vienen en el zip «Ronda-5.113-completa.zip» respetando las
carpetas (functions/, netlify/, src/ y netlify.toml suelto).

────────────────────────────────────────────────────────────────────
3) QUÉ CAMBIÓ EN CADA PIEZA (resumen técnico)
────────────────────────────────────────────────────────────────────
· functions/src/lib/bdv.ts (NUEVO) — adaptador del API Conciliación BDV:
  normalizadores con los formatos EXACTOS del manual (fecha AAAA-MM-DD,
  importe "120.00" con punto, cédula "V27037606", teléfono 11 dígitos,
  banco origen 4 dígitos) y la llamada con X-API-Key. NUNCA lanza:
  devuelve motivo honesto (no_encontrado / datos / contrato /
  inaccesible / configuracion). OJO del manual: los rechazos llegan con
  HTTP 200 y el error en body.code — el adaptador mira el code, nunca
  el status HTTP. Sin reintentos automáticos a propósito.
· functions/src/pagoMovil.ts (NUEVO) — coreCheckPagoMovil: valida el
  pago contra BDV y cierra la llave en pagoRefs/{telDestino}_{ref}.
  Guardas: sesión + App Check + rate limit 12/h + suiche ON + teléfono
  configurado + claves del servidor. Idempotente: la misma referencia
  del mismo uid con el mismo importe devuelve la evidencia guardada sin
  re-consultar al banco. Diferente uid/importe/referencia usada →
  already-exists.
· functions/src/orders.ts — createOrder ahora ACEPTA pagosBdv (máx 3):
  pre-chequeo temprano (antes de gastar imgbb), verificación
  AUTORITATIVA dentro de la transacción (pagoRefs: dueño + unused +
  importe), y si la suma cubre totals.totalVes → la orden nace «pagado»
  con payment.verifiedBy 'bdv' + bdvValidaciones + vueltoVes si sobró.
  Si quedó corto (la tasa BCV se movió entre cotizar y validar) nace
  «en_verificacion» CON su evidencia: el cajero ve el pago real y
  decide. Suiche OFF → evidencias ignoradas y comprobante exigido como
  siempre. Push de nacimiento: «pagado» directo (sin aviso al cajero).
· netlify/functions/fn-checkPagoMovil.ts (NUEVO) — wrapper HTTP estándar.
· netlify.toml — timeout 26 s para fn-checkPagoMovil (mismo margen que
  las funciones de negocio).
· src/shared/lib/pagoMovilAuto.ts (NUEVO) — helpers puros compartidos:
  elegibilidad (cuenta cuyo teléfono coincide con el guardado en
  Ajustes), referencia completa 4-15 dígitos, restante/vuelto/cobertura
  (tolerancia 0.004), fecha de HOY en hora de Venezuela.
· src/shared/services/settings.service.ts — settings/general gana
  pagoMovilAuto (false) + pagoMovilTelefono (''). Docs viejos: OFF.
· src/features/checkout/* — el paso Pago muestra «Validación automática
  con el banco» SOLO cuando el suiche está ON y la cuenta elegida es la
  BDV: botón «Validar mi pago (Bs X)», chips de pagos confirmados,
  aviso de faltante, recuperación con monto declarado, y el botón de
  rescate manual. La referencia pasa a completa en automático. El
  confirm() viaja con pagosBdv y sin imagen; el texto final dice
  «El banco confirmó tu pago automáticamente».
· src/features/admin/pages/AdminSettingsPage.tsx — tarjeta «Pago móvil
  automático (BDV)» en Operación: Manual (como hoy) / Automática (BDV)
  + teléfono de recaudo (obligatorio al encender, validado).
· src/features/admin/pages/AdminPaymentsPage.tsx — chip «Pago validado
  por el banco (BDV): Bs X» cuando la orden trae evidencias.
· src/features/orders/pages/OrderDetailPage.tsx — el cliente ve «Pago
  confirmado por el banco · fecha» (+ vuelto si hubo).

────────────────────────────────────────────────────────────────────
4) VARIABLES DE ENTORNO (cuando toque conectar el banco)
────────────────────────────────────────────────────────────────────
En tu .env LOCAL (para netlify dev) y en Netlify → Environment
variables (para producción), SOLO el día de activar:

  BDV_CONCILIACION_URL=http://200.11.243.176:444/getMovement     ← CALIDAD
  BDV_API_KEY=<la clave de 32 dígitos del manual de BDV>          ← CALIDAD

Producción (más adelante):
  BDV_CONCILIACION_URL=https://bdvconciliacion.banvenez.com/getMovement
  BDV_API_KEY=<la que GENERES TÚ desde BDVenLinea Empresa>

⚠ Sin estas variables, la validación automática responde «no está
configurada» y el checkout ofrece el camino manual — nada se rompe.

────────────────────────────────────────────────────────────────────
5) CÓMO PROBARLA EN TU PC (netlify dev) — PASO A PASO
────────────────────────────────────────────────────────────────────
PRUEBA A · REGRESIÓN (lo tuyo intacto) — 5 minutos
  1. Copia los 18 archivos a sus rutas. Reinicia netlify dev.
  2. npm test → 300 tests (286 viejos + 14 nuevos).
  3. npm --prefix functions test → 117 passed | 14 skipped
     (81 viejos + 36 nuevos; los 14 skipped son los del emulador).
  4. npm run build → typecheck limpio + PWA v1.3.0.
  5. Abre el checkout y paga con Pago Móvil como siempre: verás el
     comprobante obligatorio EXACTAMENTE como hoy. Razón: el suiche
     nuevo está APAGADO. Nada cambió. ✔

PRUEBA B · AUTOMÁTICO CONTRA EL LABORATORIO DE BDV — 15 minutos
  1. Añade al .env local las 2 variables de CALIDAD (sección 4) y
     reinicia netlify dev.
  2. Panel → Ajustes → Operación → «Pago móvil automático (BDV)»:
     elige «Automática (BDV)», teléfono 04220337872, Guardar.
     (El teléfono de tu cuenta de Pago Móvil en Formas de pago debe
     ser 04220337872 — el conciliador solo ve esa cuenta.)
  3. IMPORTANTE — truco del laboratorio: el ambiente de CALIDAD de BDV
     solo conoce sus pagos de prueba (manual MDU-006): cédula
     V27037606, teléfono 04127141363, referencia 123112313,
     fecha 2023-02-12, importe 120.00, banco origen 0102.
     Para que el checkout valide el monto EXACTO de tu pedido contra
     esa data, pon un producto de prueba a un precio que dé Bs 120.00
     de total (tasa BCV × precio + envío 0 en retiro). P. ej. con tu
     tasa: precioUSD = 120 / tasa. Crea «Producto de prueba BDV» solo
     para esta prueba (o ajusta la cantidad: 2× Bs 60.00 total…).
  4. Checkout con ese producto → paso Pago: verás «Validación
     automática con el banco» (ya NO pide comprobante).
     · Banco: (0102) Banco de Venezuela
     · Cédula: V27037606 · Teléfono: 04127141363
     · Referencia COMPLETA: 123112313 · Fecha: HOY (*)
     · Toca «Validar mi pago (Bs 120.00)».
     (*) El laboratorio puede exigir la fecha del registro de prueba
     (2023-02-12): si el banco responde «no encontró ese pago»,
     cambia la fecha del formulario a 2023-02-12 y reintenta —
     exactamente el comportamiento diseñado para un cliente que pagó
     «ayer». Con eso confirmamos también la recuperación por fecha.
  5. Resultado esperado: «El banco confirmó tu pago.» → toca «Revisar
     y confirmar» → el pedido nace «pagado» en el panel (sin cola de
     verificación) y te llega el push «SPOT 24 · Pago confirmado».
  6. PRUEBA NEGATIVA: repite con referencia 999999999 → el banco dice
     que no existe → aparece la casilla «¿Pagaste un monto distinto?»
     → prueba 120.00 (rechazo igual) → toca «Prefiero subir mi
     comprobante» → el camino manual aparece y el pedido nace en
     verificación como hoy.
  7. PRUEBA FALTANTE: producto de prueba con total Bs 120, valida un
     «pago» de 100 (decláralo en la recuperación) → la app dirá
     «Te falta pagar Bs 20.00» → valida la segunda referencia por 20 →
     cobertura completa → pedido «pagado».

PRUEBA C · VUELTA ATRÁS — 30 segundos
  Panel → Ajustes → Operación → «Manual (como hoy)» → Guardar.
  La app vuelve a comportarse EXACTAMENTE como antes, al instante.
  (Y si algún día un deploy saliera raro: Netlify → Deploys → publicar
  el anterior.)

────────────────────────────────────────────────────────────────────
6) CHECKLIST DE PRUEBAS DEL LABORATORIO (lo que falta por descubrir)
────────────────────────────────────────────────────────────────────
Cuando corras la Prueba B, estos 4 hallazgos ajustan fino (avisame el
resultado y hago los retoques en una 5.113.1):
  1. ¿La referencia se coteja COMPLETA (9 dígitos) o con los últimos 6?
  2. ¿La fecha debe ser EXACTA del movimiento o tolera diferencias?
  3. ¿Al validar con monto distinto responde 1010 («no existe» — hoy es
     nuestro supuesto) o 1000 con el monto real en data.amount? Si es
     lo segundo, activo el descubrimiento directo y ni siquiera hace
     falta preguntar el monto declarado.
  4. ¿El ambiente de calidad exige la fecha del registro (2023-02-12)?

────────────────────────────────────────────────────────────────────
7) PARA PASAR A PRODUCCIÓN (el día que decidas)
────────────────────────────────────────────────────────────────────
  1. Genera la clave real en BDVenLinea Empresa (o pídesela a tu
     ejecutivo BDV: «API key del servicio API Conciliación para mi
     RIF»). La clave de 32 dígitos del manual es SOLO de laboratorio.
  2. Netlify → Environment variables: BDV_CONCILIACION_URL (producción)
     + BDV_API_KEY (tu clave real). Jamás por el chat.
  3. Redeploy → Ajustes → «Automática (BDV)» → Guardar.
  4. Haz UN pedido real pequeño tú mismo y míralo validarse.
  5. Cualquier duda: el suiche a «Manual» y todo vuelve a como hoy.
════════════════════════════════════════════════════════════════════
