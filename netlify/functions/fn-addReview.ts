/**
 * SPOT 24 · POST /.netlify/functions/fn-addReview
 * 5.98 (punto G) · Reseñas de clientes (solo compradores con pedido entregado).
 */
import { coreAddReview } from '../../functions/src/reviews';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreAddReview, req);
