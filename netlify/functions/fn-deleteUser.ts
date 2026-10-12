/**
 * SPOT 24 · POST /.netlify/functions/fn-deleteUser
 * Elimina una cuenta por completo (solo admin): ficha, carrito, tokens de
 * notificaciones y acceso de autenticación. Los pedidos históricos se conservan.
 */
import { coreDeleteUser } from '../../functions/src/admin';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreDeleteUser, req);