/**
 * SPOT 24 · POST /.netlify/functions/fn-checkPagoMovil
 * 5.113 · Validación automática del pago móvil contra el API Conciliación BDV.
 * El cliente la llama desde el paso Pago del checkout, ANTES de crear la orden.
 */
import { coreCheckPagoMovil } from '../../functions/src/pagoMovil';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreCheckPagoMovil, req);
