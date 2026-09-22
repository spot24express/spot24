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
    // Las pruebas de reglas se ejecutan aparte con emulador (npm run test:rules).
    exclude: ['src/tests/rules/**', 'node_modules/**', 'dist/**', 'functions/**'],
  },
});
