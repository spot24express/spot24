/** Contratos del módulo checkout. */
import type { PaymentMethod } from '@/shared/constants/orders';
import type { ContactData, AddressData } from '@/shared/types';

export interface CheckoutItem {
  productId: string;
  variantId: string;
  qty: number;
}

/** Payload del callable createOrder — NUNCA incluye montos (6.3). */
export interface CreateOrderPayload {
  idempotencyKey: string;
  reservationId: string | null;
  contact: ContactData;
  address: AddressData;
  deliveryWindow: { start: string; end: string };
  notes: string;
  paymentMethod: PaymentMethod;
  paymentDetails: Record<string, string>; // valores crudos; se cifran en el backend
}

/** Totales autoritativos devueltos por el backend. */
export interface OrderTotals {
  subtotalUsd: number;
  shippingUsd: number;
  totalUsd: number;
  totalVes: number; // total en Bs con la tasa BCV del momento
  rateUsed: number;
  weightKg: number;
}

export interface QuoteRequest {
  zoneId: string;
  items: CheckoutItem[];
}

export interface QuoteResponse extends OrderTotals {
  zoneName: string;
  freeShipping: boolean;
}

export interface ReservationResponse {
  reservationId: string;
  expiresAt: number; // epoch ms
}

export interface CreateOrderResponse {
  orderId: string;
  code: string;
  totals: OrderTotals;
  riskFlags: string[];
}
