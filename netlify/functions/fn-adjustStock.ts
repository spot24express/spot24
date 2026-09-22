/**
 * SPOT 24 · POST /.netlify/functions/fn-adjustStock
 * Ajuste de stock con auditoría (admin).
 */
import { coreAdjustStock } from '../../functions/src/catalog';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreAdjustStock, req);
