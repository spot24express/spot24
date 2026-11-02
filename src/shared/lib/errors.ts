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
  | 'images'
  | 'rate-limit'
  | 'code-duplicate'
  | 'pago-no-visto'
  | 'pago-repetido'
  | 'banco-no-responde';

const USER_MESSAGES: Record<AppErrorCode, string> = {
  generic: 'Algo salió fuera de línea. Para. Resuelve. Sigue: reintenta en unos segundos.',
  offline: 'Sin conexión. Tu carrito está a salvo; seguirá cuando vuelvas.',
  unauthenticated: 'Identifícate para seguir. Es rápido y seguro.',
  forbidden: 'No tienes acceso a esta área.',
  stock: 'Alguien llegó primero a ese repuesto. Ajusta la cantidad y sigue.',
  reservation: 'Tu reserva de stock venció. Para. Resuelve. Sigue: confirma de nuevo.',
  payment: 'No pudimos procesar el pago. Verifica los datos o intenta otro método.',
  // 5.112-C · PARCHE IMGBB: imgbb (el hosting externo de todas las fotos)
  // está caído. El mensaje es la verdad, no un «reintenta» genérico: el
  // cliente entiende que NO es culpa de su red ni de su tarjeta y que su
  // carrito/comprobante no se pierde. El servidor reintenta 3 veces por
  // su cuenta antes de que este mensaje llegue a la UI.
  images:
    'El servicio de imágenes está caído. Intenta de nuevo en unos minutos: tu carrito y tu comprobante están a salvo.',
  'rate-limit': 'Demasiados intentos seguidos. Espera un momento y vuelve a intentar.',
  'code-duplicate': 'Ese código ya lo usa otro producto. Escribe uno diferente.',
  // 5.113.3 · PAGO MÓVIL BDV: la verdad del banco en la UI, con el mismo
  // espíritu del parche de imágenes (5.112-C). Los prefijos de mensaje son
  // CONTRATO con lib/backend.ts (toAppError) y con pagoMovil.ts.
  'pago-no-visto':
    'El banco no encontró ese pago con esos datos. Revisa la referencia, el monto o la fecha — o declara el monto real que pagaste.',
  'pago-repetido':
    'Esa referencia ya fue usada en otro pago. Usa la referencia del pago nuevo: cada pago tiene la suya.',
  'banco-no-responde':
    'El banco no respondió a tiempo. Tu carrito está a salvo: reintenta en unos segundos o sube tu comprobante para revisión manual.',
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
