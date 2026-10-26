import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default tseslint.config(
  { ignores: ['dist/', 'functions/lib/', 'node_modules/', 'public/'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      // Intencional: las sanitizadoras eliminan caracteres de control (6.5).
      'no-control-regex': 'off',
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'src/tests/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // extraerPdf.ts (5.87b): las referencias triple-slash a los .d.ts propios
    // son VOLUNTARIAS — pdfjs-dist no publica pdf.worker.d.mts y esas líneas
    // obligan a TODOS los tsconfig (root, netlify, functions) y a los
    // proyectos inferidos de VSC a incluir las declaraciones ambientales
    // (el dueño vio TS2307 en VSC sin ellas). La regla sugiere «import»,
    // pero para declaraciones globales el triple-slash es la herramienta
    // correcta. Excepción quirúrgica solo para ese archivo (5.91c).
    files: ['functions/src/lib/extraerPdf.ts'],
    rules: { '@typescript-eslint/triple-slash-reference': 'off' },
  },
);
