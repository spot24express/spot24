/** Contratos del módulo auth. */

export interface SpotUser {
  uid: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: 'customer' | 'admin';
  emailVerified: boolean;
  /** Época de sesión: si cambia en el backend, todas las sesiones se cierran (5.3). */
  sessionEpoch: number;
}

export type AuthScreen = 'login' | 'register' | 'reset';
