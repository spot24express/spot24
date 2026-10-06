/** Contratos del módulo auth. */

/**
 * Roles de la app (Ronda 3: + gerente):
 * · customer — compra en la tienda.
 * · cajero   — verifica pagos y prepara pedidos.
 * · delivery — toma pedidos preparados y los entrega.
 * · gerente  — jefatura: pagos, despacho, catálogo (sin borrar), métricas
 *              y lectura de usuarios; NO cambia roles ni ajustes de pago.
 * · admin    — dueño: todo, incluido cambiar roles y ajustes sensibles.
 */
export type UserRole = 'customer' | 'cajero' | 'delivery' | 'gerente' | 'admin';

export interface SpotUser {
  uid: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: UserRole;
  emailVerified: boolean;
  /** Época de sesión: si cambia en el backend, todas las sesiones se cierran (5.3). */
  sessionEpoch: number;
}

export type AuthScreen = 'login' | 'register' | 'reset';