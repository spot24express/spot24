/**
 * SPOT 24 · POST /.netlify/functions/fn-verifyPayment
 * Verificación manual de pagos (admin): antifraude, estados, auditoría.
 */
import { coreVerifyPayment } from '../../functions/src/payments';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreVerifyPayment, req);
