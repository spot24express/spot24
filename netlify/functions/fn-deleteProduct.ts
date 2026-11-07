/**
 * SPOT 24 · POST /.netlify/functions/fn-deleteProduct
 * 5.124 · Eliminar producto del panel (admin y gerente), vía Admin SDK.
 * Hasta ahora el borrado directo del cliente fallaba SIEMPRE (las reglas
 * pedían admin para la ficha y la regla de variantes evaluaba
 * request.resource.data en un delete, que no existe → permission-denied
 * para todos). Aquí el rol se verifica en el servidor y no hay que
 * desplegar reglas: el push de Netlify basta.
 */
import { coreDeleteProduct } from '../../functions/src/productDelete';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreDeleteProduct, req);
