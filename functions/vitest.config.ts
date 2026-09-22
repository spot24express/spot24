/**
 * SPOT 24 · Config de vitest para el backend (functions/).
 * Independiente de la config web: entorno node, sin jsdom.
 * Por qué existe: el paquete raíz tiene su propia config (src/) y el backend
 * debe poder probarse aislado con `npm --prefix functions test`.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  test: {
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    name: 'spot24-functions',
  },
});
