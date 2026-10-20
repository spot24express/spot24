/**
 * SPOT 24 · Scheduled function: copia de seguridad DIARIA del catálogo (5.89).
 * Netlify Scheduled Functions (plan gratis), mismo mecanismo del cron BCV.
 * Cron '0 10 * * *' UTC = 6:00 a.m. de Venezuela (UTC-4 todo el año, sin
 * horario de verano) — la hora que eligió el dueño: «antes de abrir, captura
 * el catálogo tal como lo dejaste ayer».
 * Idempotente (coreScheduledCatalogBackup salta si la última automática tiene
 * < 20 h) y nunca lanza: ante error queda el log y las copias anteriores.
 */
import { schedule } from '@netlify/functions';
import { coreScheduledCatalogBackup } from '../../functions/src/backups';

export default schedule('0 10 * * *', async (): Promise<{ statusCode: number }> => {
  await coreScheduledCatalogBackup();
  // El runtime moderno acepta «Response | undefined» (probado en vivo con el
  // cron BCV); los tipos del paquete aún declaran el contrato v1.
  return undefined as unknown as { statusCode: number };
});
