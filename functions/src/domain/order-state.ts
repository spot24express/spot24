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
