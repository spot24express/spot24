/**
 * SPOT 24 · GET|POST /.netlify/functions/fn-getBcvRate
 * Lectura pública de la tasa BCV publicada en rates/bcv.
 */
import { coreGetBcvRate } from '../../functions/src/rates';
import { handlePublic } from './_backend';

export default async (req: Request): Promise<Response> => handlePublic(coreGetBcvRate, req);
