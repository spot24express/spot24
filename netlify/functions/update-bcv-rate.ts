/**
 * SPOT 24 · Scheduled function: actualiza la tasa BCV cada hora.
 * Netlify Scheduled Functions (plan gratis) reemplaza a Cloud Scheduler.
 * Cron @hourly; ante error conserva la última tasa publicada.
 */
import { schedule } from '@netlify/functions';
import { coreUpdateBcvRate } from '../../functions/src/rates';

export default schedule('@hourly', async () => {
  await coreUpdateBcvRate();
  return { statusCode: 200 };
});
