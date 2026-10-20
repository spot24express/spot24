/**
 * SPOT 24 · POST /.netlify/functions/fn-importInventory
 * Importar inventario desde el PDF del POS (5.87): crea productos nuevos y
 * actualiza stock+precio de los existentes (admin/gerencia).
 */
import { coreImportInventory } from '../../functions/src/importInventory';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreImportInventory, req);
