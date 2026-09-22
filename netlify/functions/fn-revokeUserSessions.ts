/**
 * SPOT 24 · POST /.netlify/functions/fn-revokeUserSessions
 * Cierra todas las sesiones de un usuario (solo admin).
 */
import { coreRevokeUserSessions } from '../../functions/src/admin';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreRevokeUserSessions, req);
