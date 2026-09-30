/**
 * SPOT 24 · POST /.netlify/functions/fn-uploadImage  (solo admin)
 * Body: { data: { image: "<base64 sin prefijo>" } } (imagen ya comprimida).
 * Reenvía la imagen a la API de imgbb con IMGBB_API_KEY (Netlify env var) y
 * responde { result: { url, deleteUrl } } con el enlace directo i.ibb.co.
 * Autenticación Bearer + App Check: idénticos al resto de funciones.
 */
import { coreUploadImage } from '../../functions/src/images';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreUploadImage, req);