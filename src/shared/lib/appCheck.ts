/**
 * SPOT 24 · App Check obligatorio (sección 6.2)
 * ─────────────────────────────────────────────
 * Se inicializa una sola vez tras cargar Firebase. Con reCAPTCHA Enterprise
 * en producción (VITE_RECAPTCHA_ENTERPRISE_SITE_KEY) y proveedor de debug en
 * desarrollo local (VITE_APPCHECK_DEBUG_TOKEN). Las solicitudes sin token
 * válido son rechazadas por Firestore, Storage y Functions.
 */

let initialized = false;

export async function initAppCheck(): Promise<void> {
  const { loadFirebase } = await import('./firebase');
  const fb = await loadFirebase();
  if (!fb || initialized) return;
  initialized = true;

  const { initializeAppCheck, ReCaptchaEnterpriseProvider, CustomProvider } =
    await import('firebase/app-check');

  const enterpriseKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_SITE_KEY;
  const debugToken = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;

  if (debugToken) {
    // Desarrollo local / deploy preview: token de debug registrado en Console.
    self.FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken;
  }

  if (enterpriseKey) {
    initializeAppCheck(fb.app, {
      provider: new ReCaptchaEnterpriseProvider(enterpriseKey),
      isTokenAutoRefreshEnabled: true,
    });
    return;
  }

  if (debugToken) {
    initializeAppCheck(fb.app, {
      provider: new CustomProvider({ getToken: () => Promise.reject(new Error('appcheck-noop')) }),
      isTokenAutoRefreshEnabled: false,
    });
    return;
  }

  // Sin key ni debug token: se registra en modo "sin atestación" para que la
  // app siga funcionando mientras se completa la configuración de Console.
  // TODO(despliegue): registrar dominio en App Check con reCAPTCHA Enterprise.
  initializeAppCheck(fb.app, {
    provider: new CustomProvider({
      getToken: () =>
        Promise.reject(new Error('App Check sin proveedor configurado')),
    }),
    isTokenAutoRefreshEnabled: false,
  });
}

declare global {
  var FIREBASE_APPCHECK_DEBUG_TOKEN: string | undefined;
}
