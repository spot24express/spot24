/**
 * SPOT 24 · Estados de pedido, máquina de transiciones y método de pago VE.
 * La máquina de transiciones se replica en functions/src/domain/order-state.ts:
 * cualquier cambio aquí debe reflejarse allá (el backend es la fuente de verdad).
 *
 * Método de pago actual: Pago Móvil (el contrato ya soporta sumar más métodos).
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

export const PAYMENT_METHODS = ['pago_movil'] as const;

export type PaymentMethod = 'pago_movil';

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pago_movil: 'Pago Móvil',
};

/**
 * Instrucciones del paso de pago del checkout (FLUJO ESTRICTO).
 * El comprobante ya NO se sube después desde «Ver mi pedido»: se adjunta
 * OBLIGATORIAMENTE en el paso Pago, y el pedido nace en en_verificacion
 * con el pago incluido.
 */
export const PAYMENT_INSTRUCTIONS: Record<PaymentMethod, string> = {
  pago_movil:
    'Realiza el Pago Móvil por el monto exacto en bolívares y ten a mano la captura del comprobante: banco, cédula, teléfono, referencia (últimos 6 dígitos), fecha y la foto se registran aquí, antes de confirmar el pedido.',
};

/** ¿El método requiere comprobante registrado en el paso de pago? */
export const PAYMENT_REQUIRES_RECEIPT: Record<PaymentMethod, boolean> = {
  pago_movil: true,
};