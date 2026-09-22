/**
 * SPOT 24 · POST /.netlify/functions/fn-reserveStock
 * Reserva de stock 2 h. Requiere sesión.
 */
import { coreReserveStock } from '../../functions/src/orders';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreReserveStock, req);
