/** Contratos del módulo auth. */

/** Roles de la app: cliente, cajero (verifica pagos), delivery (motorizado) y admin. */
export type UserRole = 'customer' | 'cajero' | 'delivery' | 'admin';

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