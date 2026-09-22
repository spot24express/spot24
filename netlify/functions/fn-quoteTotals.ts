/**
 * SPOT 24 · POST /.netlify/functions/fn-quoteTotals
 * Cotización autoritativa (subtotal + envío por zona/peso + Bs). Requiere sesión.
 */
import { coreQuoteTotals } from '../../functions/src/orders';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreQuoteTotals, req);
