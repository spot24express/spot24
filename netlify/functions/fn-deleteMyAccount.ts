/**
 * SPOT 24 · POST /.netlify/functions/fn-deleteMyAccount
 * «Eliminar mi cuenta» (5.112.1): auto-baja del propio cliente. El uid sale
 * SIEMPRE del token Bearer verificado (nunca del body) y SOLO el rol customer
 * puede auto-eliminarse. Limpia ficha (user), carrito y tokens de
 * notificaciones, borra la cuenta de Auth y audita «eliminar_mi_cuenta».
 * Los pedidos históricos se conservan. Idempotente: si la cuenta ya no
 * existe en Auth, limpia los restos y responde ok.
 */
import { coreDeleteMyAccount } from '../../functions/src/admin';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreDeleteMyAccount, req);
