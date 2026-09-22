/**
 * SPOT 24 · Contexto agnóstico del runtime + init compartido de Admin SDK.
 * Los "cores" (lógica de negocio) aceptan CoreCtx, compatible con:
 *  · Cloud Functions callable (CallableRequest se proyecta a CoreCtx).
 *  · Adaptador HTTP de Netlify Functions (token Bearer + App Check header).
 * El modo Lite (plan gratis) corre en Netlify; el modo Cloud Functions sigue
 * disponible si en el futuro se activa el plan Blaze.
 */
import type { DecodedIdToken } from 'firebase-admin/auth';
import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';

/** Datos de App Check verificados por el runtime/adaptador. */
export interface CoreAppCheckData {
  appId: string;
  token: string;
}

export interface CoreCtx {
  /** Sesión verificada; undefined = anónimo (el core decide si lo exige). */
  auth?: { uid: string; token: DecodedIdToken };
  /** App Check verificado; undefined = no verificado (ver APPCHECK_ENFORCE). */
  app?: CoreAppCheckData;
  /** Payload del cliente. */
  data?: Record<string, unknown>;
}

let adminApp: App | null = null;

/**
 * Inicializa (una sola vez) firebase-admin:
 *  · Netlify Lite: credencial desde FIREBASE_SERVICE_ACCOUNT (JSON o base64).
 *  · Cloud Functions / gcloud: Application Default Credentials.
 * Jamás logs con el contenido de la credencial.
 */
export function getAdminApp(): App {
  if (adminApp) return adminApp;
  const existing = getApps().length > 0 ? getApp() : null;
  if (existing) {
    adminApp = existing;
    return adminApp;
  }
  const raw = process.env['FIREBASE_SERVICE_ACCOUNT'];
  if (raw) {
    const json = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
    adminApp = initializeApp({ credential: cert(JSON.parse(json) as Parameters<typeof cert>[0]) });
    return adminApp;
  }
  adminApp = initializeApp();
  return adminApp;
}
