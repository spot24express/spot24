/** Contratos del módulo orders. */
import type { OrderStatus, PaymentMethod } from '@/shared/constants/orders';
import type { OrderTotals } from '@/features/checkout/types';

/** Re-exporta para consumidores del módulo. */
export type { OrderStatus, PaymentMethod };

/**
 * 5.135 · Quien RECIBE cuando el comprador envía el pedido a otra persona.
 * El pagador sigue siendo el comprador (contact queda igual); esto es SOLO
 * la persona a la que el mensajero le entrega. Órdenes anteriores a 5.135
 * y compras normales: el campo no existe en la orden (undefined).
 */
export interface Destinatario {
  nombre: string;
  /** Teléfono COMPLETO en claro (mismo criterio que contact.phone desde la
   *  5.9): la cajera coordina y el mensajero llama a quien abre la puerta. */
  telefono: string;
  /**
   * 5.135-B · true = pedido a tercero SIN punto exacto: la entrega se
   * coordina por teléfono con quien recibe (badge «SIN GPS · coordinar por
   * teléfono» en el panel y caja de coordinación en /pedido). Órdenes
   * anteriores a 5.135-B: undefined.
   */
  sinUbicacion?: boolean;
}

export interface OrderLine {
  productId: string;
  variantId: string;
  /** Marca congelada al crear la orden. Órdenes viejas: undefined. */
  brand?: string;
  /** Código interno del producto (el que administra el dueño en catálogo).
   *  DECISIÓN DEL DUEÑO (5.112-A): dato SOLO del personal (verificación de
   *  pagos y despacho); el CLIENTE JAMÁS lo ve. NO es el sku de variante.
   *  Órdenes viejas: undefined → la vista cae sola a «marca». */
  code?: string;
  name: string;
  variantName: string;
  sku: string;
  unitPriceUsd: number;
  qty: number;
  lineTotalUsd: number;
  image: string;
}

/** Pago: los detalles sensibles llegan cifrados/mascarados desde el backend. */
export interface OrderPayment {
  method: PaymentMethod;
  status: 'pendiente' | 'en_verificacion' | 'pagado' | 'rechazado';
  /** Campos enmascarados para display (teléfono, referencia, banco…). */
  masked: Record<string, string>;
  referenceMasked: string;
  hasReceipt: boolean;
  /** URL pública del comprobante (imgbb) cuando el cliente ya lo subió. */
  receiptUrl?: string;
  /** Referencia COMPLETA tal como la escribió el cliente (ronda 5.9).
   *  Órdenes viejas: undefined → usar referenceMasked. */
  reference?: string;
  verifiedBy?: string;
  verifiedAt?: number;
  /** 5.113 · Pagos validados automáticamente por el banco (BDV): evidencia
   *  visible para el personal. Órdenes anteriores: undefined. */
  bdvValidaciones?: Array<{ referencia: string; importe: number; fechaPago: string }>;
  /** 5.113 · Vuelto a entregar al cliente (pagó de más del total). */
  vueltoVes?: number;
}

export interface OrderDelivery {
  zoneId: string;
  zoneName: string;
  window: { start: string; end: string; label?: string };
  /** Dirección enmascarada parcialmente para display; completa solo backend. */
  addressPreview: string;
  trackingCode: string | null;
  /** Modalidad de entrega. Órdenes antiguas: undefined (= delivery). */
  mode?: 'delivery' | 'pickup';
  /** Coordenadas GPS capturadas en el checkout (solo delivery).
   *  5.135-B · null cuando el pedido a tercero va «sin ubicación del
   *  destinatario»: la entrega se coordina por teléfono. */
  location?: { lat: number; lng: number } | null;
  /** 5.28 · Reclamo de despacho: delivery que lo tomó (first-grab-wins).
   *  Solo existe desde que el pedido fue tomado hasta su reasignación. */
  claimedByUid?: string;
  claimedByName?: string;
  claimedAt?: number;
}

export interface Order {
  id: string;
  code: string;
  uid: string;
  status: OrderStatus;
  lines: OrderLine[];
  totals: OrderTotals;
  payment: OrderPayment;
  delivery: OrderDelivery;
  contact: {
    name: string;
    /** Teléfono COMPLETO (ronda 5.9). Órdenes viejas: undefined → phoneMasked. */
    phone?: string;
    phoneMasked: string;
    /** Cédula COMPLETA en claro (ronda 5.121, pedido del dueño): la cajera la
     *  usa para cotejar el pago en el banco, igual que el teléfono desde 5.9.
     *  Órdenes anteriores a 5.121: undefined (solo está cifrada). */
    cedula?: string;
    cedulaMasked?: string;
  };
  notes: string;
  riskFlags: string[];
  /** 5.135 · El comprador mandó el pedido a OTRA PERSONA: `destinatario`
   *  trae quién recibe (nombre + teléfono) y la dirección de entrega vive
   *  en delivery (addressPreview abre con «Para: …»). Órdenes viejas y
   *  compras normales: undefined → todo se comporta exactamente como
   *  siempre (patrón undefined → fallback de las rondas anteriores). */
  envioTercero?: boolean;
  destinatario?: Destinatario;
  reservationExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
  /** 5.41 · Fecha/hora de entrega (fn-updateOrderStatus la fija al marcar
   *  Entregado). Órdenes viejas o aún no entregadas: undefined. */
  deliveredAt?: number;
}

export interface OrderEvent {
  id: string;
  status: OrderStatus;
  at: number;
  by: 'system' | 'admin' | 'customer';
  note?: string;
}
