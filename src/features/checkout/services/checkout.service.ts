/**
 * Módulo checkout · Capa de servicios.
 * TODAS las operaciones sensibles van por funciones de servidor (Netlify
 * Functions en modo Lite, mismas cores que Cloud Functions) con sesión y
 * App Check:
 * · reserveStock → reserva 2 h al entrar al checkout (5.2)
 * · quoteTotals  → cotización autoritativa (subtotal + envío por zona + Bs)
 * · createOrder  → crea la orden (el cliente NUNCA escribe en orders, 5.4)
 */
import { callFunction } from '@/shared/lib/backend';
import type {
  CheckoutItem, CreateOrderPayload, CreateOrderResponse,
  QuoteRequest, QuoteResponse, ReservationResponse,
} from '../types';

export async function reserveStock(items: CheckoutItem[]): Promise<ReservationResponse> {
  // Contrato del backend: el body viaja como { data: { items } } — NO el array
  // pelado. Antes se enviaba el array directo y el servidor leía data['items']
  // sobre un array (undefined) → 400 invalid-argument «Carrito vacío».
  return callFunction<ReservationResponse>('fn-reserveStock', { items });
}

export async function quoteTotals(req: QuoteRequest): Promise<QuoteResponse> {
  return callFunction<QuoteResponse>('fn-quoteTotals', req);
}

/** Crea la orden: el backend revalida TODO contra Firestore y el carrito real. */
export async function createOrder(payload: CreateOrderPayload): Promise<CreateOrderResponse> {
  return callFunction<CreateOrderResponse>('fn-createOrder', payload);
}