/**
 * SPOT 24 · Errores genéricos para el usuario (sección 6.9)
 * El detalle técnico jamás llega a la UI: solo a logs internos.
 */

export type AppErrorCode =
  | 'generic'
  | 'offline'
  | 'unauthenticated'
  | 'forbidden'
  | 'stock'
  | 'reservation'
  | 'payment'
  | 'rate-limit';

const USER_MESSAGES: Record<AppErrorCode, string> = {
  generic: 'Algo salió fuera de línea. Para. Resuelve. Sigue: reintenta en unos segundos.',
  offline: 'Sin conexión. Tu carrito está a salvo; seguirá cuando vuelvas.',
  unauthenticated: 'Identifícate para seguir. Es rápido y seguro.',
  forbidden: 'No tienes acceso a esta área.',
  stock: 'Alguien llegó primero a ese repuesto. Ajusta la cantidad y sigue.',
  reservation: 'Tu reserva de stock venció. Para. Resuelve. Sigue: confirma de nuevo.',
  payment: 'No pudimos procesar el pago. Verifica los datos o intenta otro método.',
  'rate-limit': 'Demasiados intentos seguidos. Espera un momento y vuelve a intentar.',
};

export class AppError extends Error {
  readonly userMessage: string;
  readonly code: AppErrorCode;
  constructor(code: AppErrorCode = 'generic', technical?: string) {
    super(technical ?? USER_MESSAGES[code]);
    this.name = 'AppError';
    this.code = code;
    this.userMessage = USER_MESSAGES[code];
  }
}

/** Mensaje único para la UI: jamás expone detalles técnicos. */
export function userMessage(error: unknown): string {
  if (error instanceof AppError) return error.userMessage;
  return USER_MESSAGES.generic;
}
