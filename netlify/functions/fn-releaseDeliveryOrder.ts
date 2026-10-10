/**
 * SPOT 24 · POST /.netlify/functions/fn-releaseDeliveryOrder (5.28)
 * «Reasignar»: SOLO gerencia/admin — suelta el claim de un pedido en camino,
 * lo devuelve a PREPARADO y vuelve a avisar a los deliverys.
 */
import { coreReleaseDeliveryOrder } from '../../functions/src/dispatch';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreReleaseDeliveryOrder, req);