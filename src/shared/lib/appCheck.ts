/**
 * SPOT 24 · App Check (sección 6.2)
 * ─────────────────────────────────────────────
 * Se inicializa una sola vez tras cargar Firebase. Prioridad de proveedores:
 *  1. reCAPTCHA Enterprise (VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) — plan Blaze.
 *  2. reCAPTCHA v3 (VITE_RECAPTCHA_V3_SITE_KEY) — plan Spark/Lite, gratis.
 *  3. Debug token (VITE_APPCHECK_DEBUG_TOKEN) junto a una llave — desarrollo local.
 *  4. Sin llave configurada — NO se inicializa nada: la app funciona normal y
 *     @firebase/auth no intenta pedir tokens a un proveedor inexistente
 *     (antes esto llenaba la consola de "Error while retrieving App Check token").
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

  const enterpriseKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const v3Key = import.meta.env.VITE_RECAPTCHA_V3_SITE_KEY;
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;

  if (debugToken) {
    // Desarrollo local / deploy preview: token de debug registrado en Console.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  // Sin llave de reCAPTCHA no hay App Check: sin instancia, ni Auth ni el
  // backend intentan obtener token y la consola queda limpia.
  if (!enterpriseKey && !v3Key) return;

  const { initializeAppCheck, ReCaptchaEnterpriseProvider, ReCaptchaV3Provider } =
    await import('firebase/app-check');

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
  }
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