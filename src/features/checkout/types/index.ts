/** Contratos del módulo checkout. */
import type { PaymentMethod } from '@/shared/constants/orders';
import type { ContactData, AddressData } from '@/shared/types';

/** Modalidad de entrega: envío a domicilio por zona o retiro en tienda. */
export type FulfillmentMode = 'delivery' | 'pickup';

export interface CheckoutItem {
  productId: string;
  variantId: string;
  qty: number;
}

/** Payload del callable createOrder — NUNCA incluye montos (6.3). */
export interface CreateOrderPayload {
  idempotencyKey: string;
  reservationId: string | null;
  /** Modalidad de entrega. En pickup el servidor fija la dirección del local. */
  fulfillment: FulfillmentMode;
  /** Líneas del carrito: el backend las revalida contra Firestore (exigidas). */
  items: CheckoutItem[];
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
  /** IVA aplicado en % (0 = sin IVA). Órdenes antiguas: undefined. */
  ivaPercent?: number;
  /** Monto del IVA en USD sobre subtotal + envío. Órdenes antiguas: undefined. */
  ivaUsd?: number;
  totalUsd: number;
  totalVes: number; // total en Bs con la tasa BCV del momento
  rateUsed: number;
}

export interface QuoteRequest {
  /** 'pickup' no requiere zona (envío 0). */
  fulfillment: FulfillmentMode;
  zoneId: string; // '' para pickup
  items: CheckoutItem[];
}

export interface QuoteResponse extends OrderTotals {
  /** Nombre de la zona; 'Retiro en tienda' cuando fulfillment = pickup. */
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