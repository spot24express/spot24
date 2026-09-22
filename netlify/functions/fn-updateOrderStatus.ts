/**
 * SPOT 24 · POST /.netlify/functions/fn-updateOrderStatus
 * Máquina de estados del despacho (admin) + tracking code + FCM.
 */
import { coreUpdateOrderStatus } from '../../functions/src/dispatch';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreUpdateOrderStatus, req);
