/** Contratos del módulo orders. */
import type { OrderStatus, PaymentMethod } from '@/shared/constants/orders';
import type { OrderTotals } from '@/features/checkout/types';

/** Re-exporta para consumidores del módulo. */
export type { OrderStatus, PaymentMethod };

export interface OrderLine {
  productId: string;
  variantId: string;
  /** Marca congelada al crear la orden. Órdenes viejas: undefined. */
  brand?: string;
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
  /** Coordenadas GPS capturadas en el checkout (solo delivery). */
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
  };
  notes: string;
  riskFlags: string[];
  reservationExpiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface OrderEvent {
  id: string;
  status: OrderStatus;
  at: number;
  by: 'system' | 'admin' | 'customer';
  note?: string;
}