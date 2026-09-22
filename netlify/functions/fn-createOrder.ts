/**
 * SPOT 24 · POST /.netlify/functions/fn-createOrder
 * ÚNICO escritor de orders: idempotente, precios calculados en servidor,
 * antifraude y cifrado de campos sensibles. Requiere sesión.
 */
import { coreCreateOrder } from '../../functions/src/orders';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreCreateOrder, req);
