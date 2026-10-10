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
  supportPhone: 'Diseñado por: Erick Simosa', // ← reemplazar por el número real de operación
  supportEmail: 'ericksimosa@gmail.com', // ← reemplazar por el correo real
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
 * Bancos venezolanos — lista oficial SUDEBAN (código + banco)
 * · En orden de codigo para el <select>.
 */
export const VE_BANKS: readonly string[] = [
  '(0102) Banco de Venezuela',
  '(0104) Venezolano de Crédito',
  '(0105) Banco Mercantil',
  '(0108) Banco Provincial',
  '(0114) Bancaribe',
  '(0115) Banco Exterior',
  '(0128) Banco Caroní',
  '(0134) Banesco',
  '(0137) Banco Sofitasa',
  '(0138) Banco Plaza',
  '(0146) Bangente',
  '(0151) BFC Banco Fondo Común',
  '(0156) 100% Banco',
  '(0157) Del Sur Banco Universal',
  '(0163) Banco del Tesoro',
  '(0168) Bancrecer',
  '(0169) R4 Banco Microfinanciero',
  '(0171) Banco Activo',
  '(0172) Bancamiga',
  '(0174) Banplus',
  '(0175) Banco Digital de los Trabajadores',
  '(0177) Banfanb',
  '(0178) N58 Banco Digital',
  '(0191) BNC',
  '(0601) Instituto Municipal de Crédito Popular',
] as const;

/**
 * Cuenta de recaudación de SPOT 24 (Pago Móvil) mostrada al cliente en el paso de pago.
 * En producción vive en Firestore → settings/payment_accounts (editable por
 * el admin); este valor es el semilla por defecto.
 */
export interface PaymentAccount {
  method: 'pago_movil';
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
    phone: '0412-0000000', // ← reemplazar por el teléfono real
  },
];