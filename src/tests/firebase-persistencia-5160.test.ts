/**
 * 5.160 · RENDIMIENTO DEL ARRANQUE (anti «app lenta»).
 *
 * Qué garantiza (sin red, sin Firebase real):
 *
 *  · Sin credenciales la app sigue en modo demo: loadFirebase resuelve null
 *    y NO toca Firestore ni IndexedDB (comportamiento intacto).
 *  · Con credenciales el bundle se construye AUNQUE el entorno no tenga
 *    IndexedDB (node/vitest): la guardia de 5.160 elige caché en memoria y
 *    initializeFirestore no lanza. En el navegador con IndexedDB el mismo
 *    código activa persistentLocalCache + gestor multi-pestaña (una sola
 *    línea de decisión, probada aquí por el camino sin IndexedDB).
 *  · Storage sigue siendo null sin bucket (plan Lite) — y el módulo
 *    firebase/storage ya no se importa en ese caso (arranque más liviano).
 *  · Singleton intacto: la segunda llamada devuelve LA MISMA instancia
 *    (nadie inicializa Firestore dos veces ni duplica vigías).
 *
 * HERMÉTICO (5.160): todas las llaves VITE_FIREBASE_* se fijan aquí con
 * vi.stubEnv ANTES de importar el módulo. Así el test pasa igual en una
 * máquina SIN .env (CI) y en la de desarrollo, donde el .env local sí tiene
 * credenciales reales y vitest las cargaría en import.meta.env. Sin esto,
 * el caso «modo demo» rompería en desarrollo por culpa del .env, no del código.
 *
 * Si un paste futuro borra la cadena de 5.160, este test se rompe y avisa.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Máquina sin .env o con él: fuerza el modo demo explícitamente. */
const ENV_VACIO = {
  VITE_FIREBASE_API_KEY: '',
  VITE_FIREBASE_AUTH_DOMAIN: '',
  VITE_FIREBASE_PROJECT_ID: '',
  VITE_FIREBASE_STORAGE_BUCKET: '',
};

/** Proyecto configurado SIN bucket de Storage (plan Lite: producción hoy). */
const ENV_CONFIGURADO = {
  VITE_FIREBASE_API_KEY: 'test-api-key',
  VITE_FIREBASE_AUTH_DOMAIN: 'test.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'test-project-5160',
  VITE_FIREBASE_STORAGE_BUCKET: '',
};

describe('5.160 · firebase.ts: persistencia local + storage condicional', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('sin credenciales sigue en modo demo: loadFirebase resuelve null', async () => {
    for (const [k, v] of Object.entries(ENV_VACIO)) vi.stubEnv(k, v);
    const { loadFirebase } = await import('@/shared/lib/firebase');
    await expect(loadFirebase()).resolves.toBeNull();
  });

  it('con credenciales y SIN IndexedDB construye el bundle (caché en memoria) y storage queda null sin bucket', async () => {
    for (const [k, v] of Object.entries(ENV_CONFIGURADO)) vi.stubEnv(k, v);
    const { loadFirebase } = await import('@/shared/lib/firebase');
    const fb = await loadFirebase();
    expect(fb).not.toBeNull();
    expect(fb!.db).toBeDefined();
    expect(fb!.auth).toBeDefined();
    expect(fb!.app).toBeDefined();
    expect(fb!.storage).toBeNull(); // plan Lite: sin bucket, sin módulo de Storage
  });

  it('singleton intacto: la segunda llamada devuelve LA MISMA instancia (sin doble init ni vigías duplicados)', async () => {
    for (const [k, v] of Object.entries(ENV_CONFIGURADO)) vi.stubEnv(k, v);
    const { loadFirebase } = await import('@/shared/lib/firebase');
    const a = await loadFirebase();
    const b = await loadFirebase();
    expect(b).toBe(a);
  });

  it('guarda el contrato público: isFirebaseConfigured sigue exportado (capa demo depende de él)', async () => {
    for (const [k, v] of Object.entries(ENV_VACIO)) vi.stubEnv(k, v);
    const mod = await import('@/shared/lib/firebase');
    expect(typeof mod.isFirebaseConfigured).toBe('function');
    expect(mod.isFirebaseConfigured()).toBe(false); // llaves forzadas a vacío
  });
});
