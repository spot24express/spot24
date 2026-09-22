/**
 * SPOT 24 · POST /.netlify/functions/fn-setUserRole
 * Asigna custom claims customer/admin (solo admin).
 */
import { coreSetUserRole } from '../../functions/src/admin';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreSetUserRole, req);
