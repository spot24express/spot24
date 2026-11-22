/**
 * SPOT 24 · Ronda 5.163 · Usuarios del panel en DOS grupos (libra PURA, sin
 * Firebase). Pedido del dueño: al entrar a Usuarios, el PERSONAL (cajeros,
 * deliverys, gerentes y admins) y los CLIENTES deben verse separados, cada
 * grupo con su número. La separación vive aquí para probarla sin Firestore y
 * para que la página no la recalcule a mano.
 */
import type { AdminUserRow } from '../services/admin.service';

/** «Personal» = TODO rol distinto de 'customer' (cajero, delivery, gerente, admin). */
export function esPersonal(u: Pick<AdminUserRow, 'role'>): boolean {
  return u.role !== 'customer';
}

export interface GruposUsuarios {
  /** Quien trabaja en el negocio: cajeros, deliverys, gerentes y admins. */
  personal: AdminUserRow[];
  /** Los que solo compran en la tienda (role 'customer'). */
  clientes: AdminUserRow[];
}

/**
 * Parte la lista en { personal, clientes } SIN mutarla. Cada cuenta tiene UN
 * solo rol, así que ningún usuario aparece dos veces y la suma de ambos
 * grupos SIEMPRE es el total de la lista recibida (propiedad que la página
 * usa para mostrar los conteos de cada grupo).
 */
export function separarUsuarios(users: AdminUserRow[]): GruposUsuarios {
  const personal: AdminUserRow[] = [];
  const clientes: AdminUserRow[] = [];
  for (const u of users) {
    (esPersonal(u) ? personal : clientes).push(u);
  }
  return { personal, clientes };
}
