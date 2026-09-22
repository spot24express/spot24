/**
 * SPOT 24 · Modo de backend.
 * DEMO_MODE se activa cuando no hay credenciales VITE_FIREBASE_*: la app
 * navega completa con datos semilla locales (catálogo, carrito, checkout
 * simulado) para desarrollo, previews y demostraciones sin datos reales.
 */
import { isFirebaseConfigured } from './firebase';

export const DEMO_MODE: boolean = !isFirebaseConfigured();
