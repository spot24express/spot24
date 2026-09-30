import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts', 'src/tests/**/*.test.ts'],
    // Las reglas NO van en el exclude global: `npm test` las excluye por CLI
    // (--exclude) y `npm run test:rules` las corre aparte con el emulador.
    exclude: ['node_modules/**', 'dist/**', 'functions/**'],
  },
});