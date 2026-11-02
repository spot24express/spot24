/**
 * SPOT 24 · Ronda 5.117 · Visibilidad de la cola de despacho por rol.
 * Libra PURA, sin Firebase (mismo espíritu que listaAdmin.ts): probable y
 * testeada sin emulador.
 *
 * Decisión del DUEÑO (aprobada en chat): «el delivery solo tendría pedidos
 * a domicilio». Un retiro en tienda NO es operación del repartidor: lo
 * prepara la caja y lo culmina gerencia/admin cuando el cliente recoge.
 * Antes de esta ronda el delivery los veía en la cola y en «Entregadas»
 * sin ningún botón útil (el backend ya le negaba el reclamo con «Es retiro
 * en tienda: no requiere delivery»): puro ruido y confusión.
 *
 * Lo que NO cambia (para no romper lo que ya funciona bien):
 * · admin y gerente siguen viendo TODO (cola, historial, chips de zona).
 * · cajero sigue viendo todo lo suyo (el retiro en tienda es su operación
 *   hasta Preparado).
 * · El filtro es SOLO de vista: el backend ya bloqueaba acciones del
 *   delivery sobre retiros (sin push de despacho, reclamo rechazado).
 */
import type { Order } from '@/features/orders/types';
import type { UserRole } from '@/features/auth/types';

/**
 * true si la orden pertenece a la operación del rol.
 * · delivery: SOLO pedidos a domicilio. `mode` undefined (órdenes viejas)
 *   cuenta como delivery — mismo criterio del backend
 *   (`order.delivery?.mode ?? 'delivery'`).
 * · Cualquier otro rol (admin, gerente, cajero): ve todo, como siempre.
 */
export function esVisiblePorRol(o: Pick<Order, 'delivery'>, role: UserRole): boolean {
  if (role !== 'delivery') return true;
  return o.delivery?.mode !== 'pickup';
}

/**
 * Filtra una cola completa (cola activa o historial «Entregadas») para el
 * rol dado. Para el delivery excluye los retiros en tienda; para el resto
 * devuelve la lista intacta en el mismo orden (copia defensiva, sin mutar
 * la entrada). Los chips de zona de «Entregadas» se derivan de la lista ya
 * filtrada: el chip «Retiro en tienda» desaparece solo para el delivery.
 */
export function filtrarColaPorRol<T extends Pick<Order, 'delivery'>>(
  orders: readonly T[],
  role: UserRole,
): T[] {
  if (role !== 'delivery') return [...orders];
  return orders.filter((o) => o.delivery?.mode !== 'pickup');
}
