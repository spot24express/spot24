/**
 * SPOT 24 · Scheduled function: actualiza la tasa BCV cada hora.
 * Netlify Scheduled Functions (plan gratis) reemplaza a Cloud Scheduler.
 * Cron explícito '0 * * * *' (a la hora en punto); ante error conserva la
 * última tasa publicada.
 * El handler NO devuelve nada: el bootstrap moderno de Netlify acepta
 * «Response o undefined» y rechazó el formato v1 { statusCode } con
 * NetlifyUserError «Function returned an unsupported value» (probado en vivo
 * 2026-09-30 — era la causa de ejecuciones horarias marcadas como error).
 * Diagnóstico: un POST directo a /.netlify/functions/update-bcv-rate ejecuta
 * el mismo core; la verificación se hace con fn-getBcvRate.
 */
import { schedule } from '@netlify/functions';
import { coreUpdateBcvRate } from '../../functions/src/rates';

export default schedule('0 * * * *', async (): Promise<{ statusCode: number }> => {
  try {
    await coreUpdateBcvRate();
  } catch (e) {
    // Nunca un crash opaco: el log de Netlify dice QUÉ falló (sin PII).
    console.error('[bcv-cron]', (e as Error)?.name ?? 'Error', '-', (e as Error)?.message ?? '');
  }
  // El runtime moderno acepta «Response | undefined» (probado en vivo); los
  // tipos del paquete aún declaran el contrato v1 { statusCode }. Devolvemos
  // undefined (lo correcto en runtime) bajo la firma que exige el tipado.
  return undefined as unknown as { statusCode: number };
});