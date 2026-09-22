/** Contratos del módulo orders. */
import type { OrderStatus, PaymentMethod } from '@/shared/constants/orders';
import type { OrderTotals } from '@/features/checkout/types';

/** Re-exporta para consumidores del módulo. */
export type { OrderStatus, PaymentMethod };

export interface OrderLine {
  productId: string;
  variantId: string;
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
  contact: { name: string; phoneMasked: string };
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
  by: 'system' | 'admin';
  note?: string;
}
