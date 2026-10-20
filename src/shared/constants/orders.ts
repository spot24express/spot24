/**
 * SPOT 24 · Estados de pedido, máquina de transiciones y métodos de pago.
 * La máquina de transiciones se replica en functions/src/domain/order-state.ts:
 * cualquier cambio aquí debe reflejarse allá (el backend es la fuente de verdad).
 *
 * Formas de pago (5.79 + 5.80): Pago Móvil, Transferencia, Efectivo, Punto de
 * Venta, Zelle y Binance. El dueño activa/desactiva cada CUENTA desde
 * /admin/ajustes (settings/payment_accounts) — y desde 5.80 puede tener
 * VARIAS cuentas del mismo método (ej. transferencias de varios bancos).
 * · Electrónicas (pago móvil, transferencia, zelle, binance): comprobante
 *   OBLIGATORIO — el pedido nace en verificación (flujo estricto).
 * · Contra entrega (efectivo, punto de venta): SIN comprobante — se cobra
 *   al recibir. También nacen en en_verificacion (cola de procesamiento),
 *   pero la cajera no verifica pago: los procesa y cobra en la entrega.
 */

export const ORDER_STATUSES = [
  'pendiente',
  'en_verificacion',
  'pagado',
  'preparado',
  'en_camino',
  'entregado',
  'cancelado',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: 'Pendiente',
  en_verificacion: 'En verificación',
  pagado: 'Pagado',
  preparado: 'Preparado',
  en_camino: 'En camino',
  entregado: 'Entregado',
  cancelado: 'Cancelado',
};

/** Texto orientado al cliente con la voz de marca. */
export const STATUS_CUSTOMER_TEXT: Record<OrderStatus, string> = {
  pendiente: 'Tu pedido espera el comprobante de pago. Súbilo y sigue.',
  en_verificacion: 'Estamos verificando tu pago. Para. Resuelve. Sigue.',
  pagado: 'Pago confirmado. Tu pedido entra al pit stop.',
  preparado: 'Empacado y listo. Salió de la bahía.',
  en_camino: 'En ruta hacia tu parada. Sigue tu pedido en vivo.',
  entregado: 'Entregado. Abierto cuando importa.',
  cancelado: 'Pedido cancelado. Cuando quieras, aquí estamos.',
};

/**
 * Transiciones válidas. Solo Cloud Functions mutan el estado; esta máquina
 * se aplica en el backend y se usa en cliente solo para mostrar/ocultar botones.
 */
export const STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  pendiente: ['en_verificacion', 'cancelado'],
  en_verificacion: ['pagado', 'cancelado'],
  pagado: ['preparado', 'cancelado'],
  preparado: ['en_camino', 'cancelado'],
  en_camino: ['entregado'],
  entregado: [],
  cancelado: [],
};

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return STATUS_TRANSITIONS[from].includes(to);
}

export const PAYMENT_METHODS = [
  'pago_movil',
  'transferencia',
  'efectivo',
  'punto_venta',
  'zelle',
  'binance',
] as const;

export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pago_movil: 'Pago Móvil',
  transferencia: 'Transferencia',
  efectivo: 'Efectivo',
  punto_venta: 'Punto de venta',
  zelle: 'Zelle',
  binance: 'Binance',
};

/** Orden estable de presentación en chips del checkout y tarjetas del panel. */
export const PAYMENT_METHOD_ORDER: readonly PaymentMethod[] = PAYMENT_METHODS;

/**
 * Instrucciones del paso de pago del checkout (FLUJO ESTRICTO).
 * El comprobante ya NO se sube después desde «Ver mi pedido»: se adjunta
 * OBLIGATORIAMENTE en el paso Pago, y el pedido nace en en_verificacion
 * con el pago incluido.
 */
export const PAYMENT_INSTRUCTIONS: Record<PaymentMethod, string> = {
  pago_movil:
    'Realiza el Pago Móvil por el monto exacto en bolívares y ten a mano la captura del comprobante: banco, cédula, teléfono, referencia (últimos 6 dígitos), fecha y la foto se registran aquí, antes de confirmar el pedido.',
  transferencia:
    'Haz la transferencia por el monto exacto en bolívares a la cuenta de abajo y ten a mano la captura: banco, cédula, teléfono, referencia, fecha y la foto se registran aquí, antes de confirmar el pedido.',
  efectivo:
    'Paga EN EFECTIVO al recibir tu pedido (o al retirarlo en tienda). Si puedes ten el monto exacto: el mensajero lleva el total anotado. Confirmas aquí y tu pedido entra en cola.',
  punto_venta:
    'Paga con tu TARJETA en nuestro punto de venta al recibir tu pedido (o en tienda al retirar). El terminal va listo con el total exacto. Confirmas aquí y tu pedido entra en cola.',
  zelle:
    'Envía el Zelle por el monto exacto en dólares al correo de abajo (titular SPOT 24) y ten a mano la captura de la confirmación: banco de origen, titular, número de confirmación, fecha y la foto se registran aquí.',
  binance:
    'Envía el pago por Binance Pay al ID de abajo y guarda la captura: usuario, Order ID de la transacción, fecha y la foto se registran aquí, antes de confirmar el pedido.',
};

/** ¿El método exige comprobante registrado en el paso de pago?
 *  · Electrónicas (5.79): SIEMPRE — flujo estricto, el pedido nace pagado y
 *    entra a la cola de verificación de la cajera.
 *  · Contra entrega (5.80): NO — el pago ocurre en la entrega (efectivo o
 *    terminal), no hay captura que subir. Nacen en verificación igual y la
 *    cajera los procesa desde Pedidos, cobrando al entregar. */
export const PAYMENT_REQUIRES_RECEIPT: Record<PaymentMethod, boolean> = {
  pago_movil: true,
  transferencia: true,
  efectivo: false,
  punto_venta: false,
  zelle: true,
  binance: true,
};

/** Texto de estado ajustado por método: en contra-entrega «verificando tu
 *  pago» confunde (el pago ocurre al recibir), así que se dice claro. */
export function customerStatusText(status: OrderStatus, method: PaymentMethod): string {
  if (status === 'en_verificacion' && !PAYMENT_REQUIRES_RECEIPT[method]) {
    return method === 'efectivo'
      ? 'Pedido recibido. Prepara el efectivo: pagas al recibir (monto exacto si puedes).'
      : 'Pedido recibido. Ten tu tarjeta lista: pagas en el punto de venta al recibir.';
  }
  return STATUS_CUSTOMER_TEXT[status];
}