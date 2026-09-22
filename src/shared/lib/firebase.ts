/**
 * SPOT 24 · Inicialización única de Firebase (src/shared/lib/firebase.ts)
 * ─────────────────────────────────────────────────────────────────────────
 * · Cero credenciales en código: todo entra por variables VITE_*.
 * · Carga perezosa por import dinámico: en modo demo (sin env vars) Firebase
 *   nunca se inicializa ni se descarga el chunk 'firebase-vendor'.
 * · Ningún componente importa esto directamente: solo las capas de servicios
 *   de cada feature (arquitectura modular, sección 4.3 del prompt maestro).
 */

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
} as const;

/** true solo si las credenciales mínimas están presentes en el entorno. */
export function isFirebaseConfigured(): boolean {
  return Boolean(
    firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.authDomain,
  );
}

/** Región única de despliegue de Cloud Functions. */
export const FUNCTIONS_REGION = 'us-central1';

export interface FirebaseBundle {
  app: import('firebase/app').FirebaseApp;
  auth: import('firebase/auth').Auth;
  db: import('firebase/firestore').Firestore;
  storage: import('firebase/storage').FirebaseStorage;
  functions: import('firebase/functions').Functions;
}

let bundlePromise: Promise<FirebaseBundle | null> | null = null;

/**
 * Carga (una sola vez) el bundle completo de Firebase.
 * Devuelve null cuando el proyecto no está configurado → la capa de servicios
 * activa su adaptador demo correspondiente.
 */
export function loadFirebase(): Promise<FirebaseBundle | null> {
  if (!isFirebaseConfigured()) return Promise.resolve(null);
  if (!bundlePromise) {
    bundlePromise = (async () => {
      const [
        { initializeApp, getApps, getApp },
        { getAuth },
        { getFirestore },
        { getStorage },
        { getFunctions },
      ] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
        import('firebase/storage'),
        import('firebase/functions'),
      ]);
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      return {
        app,
        auth: getAuth(app),
        db: getFirestore(app),
        storage: getStorage(app),
        functions: getFunctions(app, FUNCTIONS_REGION),
      };
    })();
  }
  return bundlePromise;
}
