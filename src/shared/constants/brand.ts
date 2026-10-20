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

/**
 * 5.75 · El horario de los DELIVERYS ya NO vive aquí: el dueño lo edita en
 * Admin → Ajustes (settings/general.deliveryHours) y aplica sin deploy.
 * El valor por defecto vive en GENERAL_SEED (settings.service.ts).
 */

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
 * Cuentas de recaudación de SPOT 24 mostradas al cliente en el paso de pago.
 * En producción viven en Firestore → settings/payment_accounts (editable por
 * el admin); estos valores son la semilla por defecto.
 * Ronda 5.79: interruptor «active» por forma — el dueño decide cuáles ve el
 * cliente en el checkout.
 * Ronda 5.80: MULTICUENTA — el array admite varias cuentas del mismo método
 * (ej. transferencias de Banesco Y del BNC): cada una con su `id` estable
 * (selección del cliente) y su `label` opcional para distinguirlas.
 */
import type { PaymentMethod } from './orders';

export interface PaymentAccount {
  /** Id estable de la cuenta (5.80): el checkout recuerda cuál eligió.
   *  Documentos previos sin id: se asume `method` (una cuenta por método). */
  id?: string;
  /** Nombre para distinguir cuentas del mismo método (ej. «Banesco»,
   *  «Cuenta Erick»). Opcional: sin él se usa el nombre del método. */
  label?: string;
  method: PaymentMethod;
  /** Interruptor del dueño. Documentos viejos sin el campo se tratan como activos. */
  active: boolean;
  /** Banco de recaudación (pago móvil/transferencia) o entidad emisora. */
  bank: string;
  /** RIF del negocio — se copia sin letras en los métodos VE; '' en Zelle/Binance. */
  rif: string;
  /** Número de cuenta 20 dígitos (transferencia; opcional en pago móvil). */
  accountNumber?: string;
  /** Teléfono afiliado al Pago Móvil. */
  phone?: string;
  /** Correo de recaudo (Zelle; opcional en el resto). */
  email?: string;
  /** Titular de la cuenta (Zelle/Binance). */
  holderName?: string;
  /** Binance Pay ID / UID de recaudo. */
  binanceId?: string;
  /** Imagen QR de la cuenta (subida por el dueño desde Ajustes → imgbb,
   *  o enlace pegado). 5.80: cada cuenta tiene el SUYO. */
  qrUrl?: string;
}

/** QR de Pago Móvil empaquetado (Suiche 7B del dueño, ronda 5.79). */
export const DEFAULT_QR_PAGO_MOVIL = '/img/qr-pago-movil.jpg';

/**
 * Semilla (solo si Firestore aún no tiene documento guardado):
 * · Pago Móvil activa con el QR empaquetado — la tienda cobra desde el día 1.
 * · Efectivo y Punto de venta activas (5.80, pedido del dueño): se cobran al
 *   entregar, no necesitan datos de recaudo.
 * · Transferencia/Zelle/Binance inactivas hasta que el dueño llene sus datos.
 */
export const DEFAULT_PAYMENT_ACCOUNTS: readonly PaymentAccount[] = [
  {
    id: 'pago_movil',
    method: 'pago_movil',
    active: true,
    bank: 'Mercantil Banco',
    rif: 'J-00000000-0', // ← reemplazar por el RIF real
    phone: '0412-0000000', // ← reemplazar por el teléfono real
    qrUrl: DEFAULT_QR_PAGO_MOVIL,
  },
  { id: 'transferencia', method: 'transferencia', active: false, bank: '', rif: '' },
  { id: 'efectivo', method: 'efectivo', active: true, bank: '', rif: '' },
  { id: 'punto_venta', method: 'punto_venta', active: true, bank: '', rif: '' },
  { id: 'zelle', method: 'zelle', active: false, bank: '', rif: '' },
  { id: 'binance', method: 'binance', active: false, bank: '', rif: '' },
];