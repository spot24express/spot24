/**
 * SPOT 24 · POST /.netlify/functions/fn-importInventory
 * Importar inventario (5.87 → 5.161): HOY solo el modo «actualizar» con el
 * Excel del ERP (5.151/5.152) — upsert precio+stock y borradores inactivos.
 * El import por PDF se retiró (pendiente 5.154 cerrada en la 5.161).
 */
import { coreImportInventory } from '../../functions/src/importInventory';
import { handle } from './_backend';

export default async (req: Request): Promise<Response> => handle(coreImportInventory, req);
