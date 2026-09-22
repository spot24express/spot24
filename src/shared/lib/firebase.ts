/**
 * SPOT 24 · Inicialización única de Firebase (src/shared/lib/firebase.ts)
 * ─────────────────────────────────────────────────────────────────────────
 * · Cero credenciales en código: todo entra por variables VITE_*.
 * · Carga perezosa por import dinámico: en modo demo (sin env vars) Firebase
 *   nunca se inicializa ni se descarga el chunk 'firebase-vendor'.
 * · Sin SDK de Cloud Functions en el cliente: las operaciones sensibles van
 *   por HTTP a /.netlify/functions/* (ver shared/lib/backend.ts).
 * · Storage solo se inicializa si VITE_FIREBASE_STORAGE_BUCKET está presente
 *   (plan Blaze); en Lite no hay bucket y la UI oculta las subidas.
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

export interface FirebaseBundle {
  app: import('firebase/app').FirebaseApp;
  auth: import('firebase/auth').Auth;
  db: import('firebase/firestore').Firestore;
  /** null en plan Spark/Lite: no hay bucket → la UI oculta subidas. */
  storage: import('firebase/storage').FirebaseStorage | null;
}

let bundlePromise: Promise<FirebaseBundle | null> | null = null;

/**
 * Carga (una sola vez) el bundle de Firebase.
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
      ] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
        import('firebase/storage'),
      ]);
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      return {
        app,
        auth: getAuth(app),
        db: getFirestore(app),
        storage: firebaseConfig.storageBucket ? getStorage(app) : null,
      };
    })();
  }
  return bundlePromise;
}
