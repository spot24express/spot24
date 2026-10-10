/**
 * SPOT 24 · POST /.netlify/functions/fn-claimDeliveryOrder (5.28)
 * «Tomar pedido»: SOLO rol delivery — asigna el pedido a quien lo agarra
 * primero y lo pasa a EN CAMINO en una transacción atómica (1 acción).
 */
import { coreClaimDeliveryOrder } from '../../functions/src/dispatch';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreClaimDeliveryOrder, req);