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
 * Bancos venezolanos con Pago Móvil — lista activa SUDEBAN (verificada 2025-2026).
 * · Se incluyó BOD durante su transición hacia BNC (los clientes migran 0116 → 0191).
 * · Descartados: bancos cerrados o fusionados (Espirito Santo, Citibank retail,
 *   Helm Bank) y fantasmas («Banco Platino» no existe).
 * · En orden alfabético para el <select>.
 */
export const VE_BANKS: readonly string[] = [
  '100% Banco',
  'Bancamiga',
  'Bancaribe',
  'Banco Activo',
  'Banco Agrícola de Venezuela',
  'Banco Bicentenario',
  'Banco Caroní',
  'Banco de la Fuerza Armada Nacional Bolivariana (Banfanb)',
  'Banco de la Gente Emprendedora (Bangente)',
  'Banco de Venezuela (BDV)',
  'Banco del Tesoro',
  'Banco Exterior',
  'Banco Internacional de Desarrollo (BID)',
  'Banco Nacional de Crédito (BNC)',
  'Banco Plaza',
  'Banco Sofitasa',
  'Banco Venezolano de Crédito (BVC)',
  'Bancrecer',
  'Banplus',
  'BBVA Provincial',
  'BFC Banco Fondo Común',
  'BOD (Banco Occidental de Descuento)',
  'DelSur Banco Universal',
  'Mercantil Banco',
  'N58 Banco Digital',
  'R4 Banco Microfinanciero',
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