/**
 * SPOT 24 · POST /.netlify/functions/fn-getAdminMetrics
 * Métricas agregadas del panel (solo admin): conteos, ventas 30d, top 5.
 */
import { coreGetAdminMetrics } from '../../functions/src/admin';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreGetAdminMetrics, req);
