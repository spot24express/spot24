/**
 * SPOT 24 · POST /.netlify/functions/fn-cancelOrder
 * Cancelación con liberación de reserva o reposición de stock. Requiere sesión.
 */
import { coreCancelOrder } from '../../functions/src/orders';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreCancelOrder, req);
