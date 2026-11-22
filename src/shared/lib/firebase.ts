/**
 * SPOT 24 · Inicialización única de Firebase (src/shared/lib/firebase.ts)
 * ─────────────────────────────────────────────────────────────────────────
 * · Cero credenciales en código: todo entra por variables VITE_*.
 * · Carga perezosa por import dinámico: en modo demo (sin env vars) Firebase
 *   nunca se inicializa ni se descarga el chunk 'firebase-vendor'.
 * · Sin SDK de Cloud Functions en el cliente: las operaciones sensibles van
 *   por HTTP a /.netlify/functions/* (ver shared/lib/backend.ts).
 * · 5.160 · PERSISTENCIA LOCAL: el catálogo que el cliente ya vio queda en
 *   IndexedDB y la próxima apertura pinta AL INSTANTE (antes: ciclo completo
 *   de red en cada apertura — la causa del «app lenta» en redes venezolanas).
 *   Si IndexedDB no está disponible, cae a memoria = comportamiento anterior.
 * · 5.160 · Storage SOLO si hay bucket (plan Lite no lo usa): deja de cargar
 *   el módulo en cada apertura. Si algún día hay bucket, vuelve solo.
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
 * 5.160 · true solo si el entorno ofrece IndexedDB, base de la persistencia.
 * Algunos modos privados/visores embebidos lo bloquean: ahí se usa la caché
 * en memoria, que es exactamente el comportamiento anterior a esta ronda.
 * La detección explícita evita sorpresas: initializeFirestore solo GUARDA la
 * configuración (no toca IndexedDB hasta la primera consulta), así que esta
 * guardia decide el camino con cero riesgo.
 */
function hayIndexedDb(): boolean {
  try {
    return typeof indexedDB !== 'undefined' && indexedDB !== null;
  } catch {
    return false;
  }
}

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
        { initializeFirestore, persistentLocalCache, persistentMultipleTabManager, memoryLocalCache },
      ] = await Promise.all([
        import('firebase/app'),
        import('firebase/auth'),
        import('firebase/firestore'),
      ]);
      const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
      // 5.160 · PERSISTENCIA LOCAL DEL CATÁLOGO (anti «app lenta»):
      // · persistentLocalCache: los documentos ya leídos (primeras páginas del
      //   catálogo, tasa BCV, ajustes, pedidos vistos) quedan en IndexedDB del
      //   teléfono. La próxima apertura SIRVE de ahí (≈0.3 s, también sin
      //   señal) y Firestore sincroniza cambios por detrás. Antes cada
      //   apertura re-descargaba todo: 6-7 consultas en frío sobre red mala.
      // · persistentMultipleTabManager: la PWA instalada y el navegador
      //   abierto A LA VEZ no se pelean por el candado de pestaña (escenario
      //   real: cliente instala la PWA y también entra por Safari/Chrome).
      // · Caché en memoria (camino anterior) si no hay IndexedDB.
      // · Salvaguarda: si esta app de Firebase ya tenía Firestore con otras
      //   opciones (HMR en desarrollo / re-evaluación del módulo), se reutiliza
      //   la instancia existente en vez de lanzar «already been called with
      //   different options» — en producción nunca ocurre (el módulo evalúa
      //   una vez por carga), pero el fallo seguro no cuesta nada.
      let db: import('firebase/firestore').Firestore;
      try {
        db = initializeFirestore(app, {
          localCache: hayIndexedDb()
            ? persistentLocalCache({ tabManager: persistentMultipleTabManager() })
            : memoryLocalCache(),
        });
      } catch {
        db = (await import('firebase/firestore')).getFirestore(app);
      }
      // 5.160 · Storage SOLO si hay bucket (plan Blaze): en Lite el import
      // dinámico no ocurre → el módulo firebase/storage sale del chunk y el
      // arranque baja menos bytes. Si algún día se configura el bucket,
      // storage vuelve a existir sin tocar una línea.
      let storage: import('firebase/storage').FirebaseStorage | null = null;
      if (firebaseConfig.storageBucket) {
        const { getStorage } = await import('firebase/storage');
        storage = getStorage(app);
      }
      return {
        app,
        auth: getAuth(app),
        db,
        storage,
      };
    })();
  }
  return bundlePromise;
}
