/**
 * SPOT 24 · Shim de Netlify Functions.
 * La implementación vive en functions/src/lib/http-ctx.ts (así firebase-admin
 * resuelve desde functions/node_modules en typecheck y en el bundling).
 */
export { handle, handlePublic, type Core } from '../../functions/src/lib/http-ctx';
