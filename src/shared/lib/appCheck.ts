/**
 * SPOT 24 · App Check (sección 6.2)
 * ─────────────────────────────────────────────
 * Se inicializa una sola vez tras cargar Firebase. Prioridad de proveedores:
 *  1. reCAPTCHA Enterprise (VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) — plan Blaze.
 *  2. reCAPTCHA v3 (VITE_RECAPTCHA_V3_SITE_KEY) — plan Spark/Lite, gratis.
 *  3. Debug token (VITE_APPCHECK_DEBUG_TOKEN) — desarrollo local/previews.
 *  4. Sin atestación — la app sigue funcionando en modo monitoreo.
 * La exigencia del token en el backend se activa con APPCHECK_ENFORCE=true
 * (Console → App Check → Enforce) después de validar el tráfico (6.2).
 */

let initialized = false;
let instance: import('firebase/app-check').AppCheck | null = null;

export async function initAppCheck(): Promise<void> {
  const { loadFirebase } = await import('./firebase');
  const fb = await loadFirebase();
  if (!fb || initialized) return;
  initialized = true;

  const {
    initializeAppCheck,
    ReCaptchaEnterpriseProvider,
    ReCaptchaV3Provider,
    CustomProvider,
  } = await import('firebase/app-check');

  const enterpriseKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const v3Key = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;

  if (debugToken) {
    // Desarrollo local / deploy preview: token de debug registrado en Console.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  if (enterpriseKey) {
    instance = initializeAppCheck(fb.app, {
      provider: new ReCaptchaEnterpriseProvider(enterpriseKey),
      isTokenAutoRefreshEnabled: true,
    });
    return;
  }

  if (v3Key) {
    instance = initializeAppCheck(fb.app, {
      provider: new ReCaptchaV3Provider(v3Key),
      isTokenAutoRefreshEnabled: true,
    });
    return;
  }

  if (debugToken) {
    instance = initializeAppCheck(fb.app, {
      provider: new CustomProvider({ getToken: () => Promise.reject(new Error('appcheck-noop')) }),
      isTokenAutoRefreshEnabled: false,
    });
    return;
  }

  // Sin key ni debug token: se registra en modo "sin atestación" para que la
  // app siga funcionando mientras se completa la configuración de Console.
  instance = initializeAppCheck(fb.app, {
    provider: new CustomProvider({
      getToken: () => Promise.reject(new Error('App Check sin proveedor configurado')),
    }),
    isTokenAutoRefreshEnabled: false,
  });
}

/** Token App Check actual; null si no hay proveedor activo (no bloquea). */
export async function getAppCheckToken(): Promise<string | null> {
  try {
    if (!instance) return null;
    const { getToken } = await import('firebase/app-check');
    const res = await getToken(instance, false);
    return res?.token || null;
  } catch {
    return null;
  }
}

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | undefined;
}
