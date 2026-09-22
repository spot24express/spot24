/**
 * SPOT 24 · Voz de marca y bancos venezolanos para formularios de pago.
 * Voz: afirmativa y corta. "Para. Resuelve. Sigue." principal,
 * "Abierto cuando importa." como cierre.
 */

export const BRAND = {
  name: 'SPOT 24',
  slogan: 'Tu parada segura. 24/7.',
  voice: ['Para.', 'Resuelve.', 'Sigue.'] as const,
  closing: 'Abierto cuando importa.',
  supportPhone: '+58 412-000-0000', // ← reemplazar por el número real de operación
  supportEmail: 'hola@spot24.com.ve', // ← reemplazar por el correo real
} as const;

/** Mensajes de marca para estados de UI (voz afirmativa y corta). */
export const VOICE = {
  emptyCart: 'Tu carrito espera. Para. Resuelve. Sigue.',
  emptyOrders: 'Sin pedidos todavía. Tu primera parada empieza aquí.',
  emptySearch: 'No encontramos esa pieza. Prueba con otra palabra.',
  emptyCatalog: 'Categoría en preparación. Volvemos al rato.',
  errorRetry: 'No salió. Reintenta y seguimos.',
  offline: 'Sin conexión. Lo que ya viste sigue disponible.',
  thanks: 'Pedido en la bahía. Abierto cuando importa.',
} as const;

/**
 * Bancos venezolanos con Pago Móvil / transferencias.
 * Mantener en orden alfabético para el <select>.
 */
export const VE_BANKS: readonly string[] = [
  'Banco Activo',
  'Banco Bicentenario',
  'Banco Caroní',
  'Banco del Tesoro',
  'Banco Exterior',
  'Banco Nacional de Crédito (BNC)',
  'Banco Platino',
  'Banco Sofitasa',
  'Bancrecer',
  'Banesco',
  'Banplus',
  'BBVA Provincial',
  'BOD (Banco Occidental de Descuento)',
  'Banco Venezolano de Crédito',
  'Mercantil Banco',
  'Mi Banco',
  'Banco de Venezuela (BDV)',
] as const;

/**
 * Cuentas de recaudación de SPOT 24 mostradas al cliente en el paso de pago.
 * En producción viven en Firestore → settings/payment_accounts (editables por
 * el admin); estos valores son el semilla por defecto.
 */
export interface PaymentAccount {
  method: 'pago_movil' | 'transferencia' | 'zelle';
  bank: string;
  rif: string;
  accountNumber?: string;
  phone?: string;
  email?: string;
}

export const DEFAULT_PAYMENT_ACCOUNTS: readonly PaymentAccount[] = [
  {
    method: 'pago_movil',
    bank: 'Mercantil Banco',
    rif: 'J-00000000-0', // ← reemplazar por el RIF real
    phone: '0412-0000000',
  },
  {
    method: 'transferencia',
    bank: 'Banesco',
    rif: 'J-00000000-0',
    accountNumber: '0134 0000 00 0000000000',
  },
  {
    method: 'zelle',
    bank: 'Zelle',
    rif: '—',
    email: 'pagos@spot24.com.ve',
  },
];
