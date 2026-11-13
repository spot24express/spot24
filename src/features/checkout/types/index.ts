/** Contratos del módulo checkout. */
import type { PaymentMethod } from '@/shared/constants/orders';
import type { PagoBdvEvidence } from '@/shared/lib/pagoMovilAuto';
import type { ContactData, AddressData } from '@/shared/types';

/** Modalidad de entrega: envío a domicilio por zona o retiro en tienda. */
export type FulfillmentMode = 'delivery' | 'pickup';

export interface CheckoutItem {
  productId: string;
  variantId: string;
  qty: number;
}

/**
 * 5.135 · ENVIAR A OTRA PERSONA: quién RECIBE el pedido. El pagador sigue
 * siendo el comprador (contact queda intacto — decisión del dueño); el
 * destinatario solo aporta nombre y teléfono (en claro para cajera y
 * mensajero, mismo criterio de contact.phone desde la 5.9). Su DIRECCIÓN de
 * entrega viaja en `address` (misma estructura de siempre) — por eso la
 * tarifa sale de la zona del destinatario y el GPS guía al mensajero.
 */
export interface DestinatarioData {
  nombre: string;
  telefono: string;
  /**
   * 5.135-B · El comprador marcó «No tengo la ubicación del destinatario»:
   * el pedido viaja SIN punto exacto (address.location null), los detalles
   * escritos (≥ 8 caracteres) son la única referencia y el mensajero
   * coordina por teléfono con quien recibe. Viaja SOLO con la marca puesta
   * — compras de tercero normales ni lo traen (contrato limpio como 5.135).
   */
  sinUbicacion?: boolean;
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
  /**
   * 5.135 · Solo en envío a domicilio: el pedido llega a otra persona.
   * Omitido (o undefined) en compras normales y retiro en tienda — el
   * backend lo rechaza si viaja con pickup y EXIGE el GPS del punto de
   * entrega (address.location) cuando viaja con delivery.
   * 5.135-B · SALVO sinUbicacion = true: entonces EXIGE address.details
   * (≥ 8 caracteres) y address.location puede venir null — el mensajero
   * coordina el punto por teléfono con quien recibe.
   */
  entregaTercero?: DestinatarioData;
  deliveryWindow: { start: string; end: string };
  notes: string;
  paymentMethod: PaymentMethod;
  paymentDetails: Record<string, string>; // valores crudos; se cifran en el backend
  /**
   * FLUJO ESTRICTO: comprobante de pago en base64 puro (sin prefijo data:),
   * comprimido en el cliente. OBLIGATORIO: el backend lo sube a imgbb ANTES de
   * crear la orden y el pedido nace en en_verificacion con hasReceipt: true.
   * Si falta, el servidor rechaza la creación (no existen pedidos sin pago).
   * 5.113: en pago móvil con validación automática puede venir vacío —
   * viajan las evidencias BDV de abajo.
   */
  receiptImage: string;
  /** 5.113 · Evidencias de pago validado por el banco (BDV). Cada una quedó
   *  cerrada en pagoRefs por fn-checkPagoMovil; createOrder las cobra y, si
   *  cubren el total, la orden nace «pagado». Opcional; máx 3 (parciales). */
  pagosBdv?: PagoBdvEvidence[];
}

/** Totales autoritativos devueltos por el backend. */
export interface OrderTotals {
  subtotalUsd: number;
  shippingUsd: number;
  /** IVA aplicado en % (0 = sin IVA). Órdenes antiguas: undefined. */
  ivaPercent?: number;
  /** Parte del IVA en USD (referencia del panel). Órdenes antiguas: undefined.
   *  B1 (ronda 5.120): el IVA vive DENTRO del precio publicado — aquí viaja
   *  ya extraído, no sumado. */
  ivaUsd?: number;
  totalUsd: number;
  /** Total en Bs con la tasa BCV del momento (oficial, calculado en el servidor). */
  totalVes: number;
  rateUsed: number;
  /** Desglose oficial en Bs (Ronda 3). Órdenes/cotizaciones anteriores: undefined. */
  subtotalVes?: number;
  shippingVes?: number;
  ivaVes?: number;
  /** B1 (ronda 5.120) · Base imponible en Bs: el precio publicado SIN la
   *  parte del IVA (extraída del monto, no sumada). Con IVA 0 coincide con
   *  subtotalVes. Órdenes anteriores a esta ronda: undefined → el cliente
   *  cae a subtotalVes, que en el modelo anterior YA era la base. */
  baseVes?: number;
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
