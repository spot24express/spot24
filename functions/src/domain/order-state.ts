/**
 * SPOT 24 · Máquina de estados del pedido (fuente de verdad del backend).
 * Debe mantenerse sincronizada con src/shared/constants/orders.ts.
 */
export type OrderStatus =
  | 'pendiente'
  | 'en_verificacion'
  | 'pagado'
  | 'preparado'
  | 'en_camino'
  | 'entregado'
  | 'cancelado';

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
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

/**
 * 5.112.1 · Modalidad de entrega del pedido.
 */
export type FulfillmentMode = 'delivery' | 'pickup';

/**
 * 5.112.1 · Transición válida PARA LA MODALIDAD del pedido (el backend es la
 * fuente de verdad; el panel replica esta regla al pintar botones).
 * · delivery → máquina base intacta: preparado solo avanza a en_camino y el
 *   reclamo del delivery (5.28) hace el resto.
 * · pickup (retiro en tienda) → «En camino» NO EXISTE en el flujo (nadie sale
 *   a entregarlo): del mostrador pasa DIRECTO a entregado
 *   (preparado → entregado, gesto del personal de caja/gerencia). Un pickup
 *   legacy que ya quedó en en_camino se puede cerrar a entregado (máquina
 *   base) para que ningún pedido quede varado.
 */
export function canTransitionFor(from: OrderStatus, to: OrderStatus, mode: FulfillmentMode): boolean {
  if (mode !== 'pickup') return canTransition(from, to);
  if (to === 'en_camino') return false;
  if (from === 'preparado' && to === 'entregado') return true;
  return canTransition(from, to);
}

export function isOrderStatus(v: unknown): v is OrderStatus {
  return (
    v === 'pendiente' ||
    v === 'en_verificacion' ||
    v === 'pagado' ||
    v === 'preparado' ||
    v === 'en_camino' ||
    v === 'entregado' ||
    v === 'cancelado'
  );
}
