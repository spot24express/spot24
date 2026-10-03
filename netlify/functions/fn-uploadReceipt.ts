/**
 * SPOT 24 · POST /.netlify/functions/fn-uploadReceipt
 * El CLIENTE sube el comprobante de pago de SU orden → imgbb.
 * Requiere sesión y propiedad de la orden (todo se verifica en coreUploadReceipt).
 */
import { coreUploadReceipt } from '../../functions/src/orders';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreUploadReceipt, req);
