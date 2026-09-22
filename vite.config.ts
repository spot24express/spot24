import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };
const APP_VERSION = `${pkg.version}-${Date.now()}`;

// CSP de desarrollo: más laxa que producción (HMR necesita eval/inline/ws).
// La CSP estricta de producción vive en netlify.toml.
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' ws: wss: https:",
  "worker-src 'self' blob:",
  "frame-ancestors 'none'",
].join('; ');

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      // autoUpdate: el SW nuevo toma el control al terminar de precachear.
      // injectRegister 'script-defer': el registro vive en un archivo aparte,
      // nunca en un <script> inline, para respetar la CSP estricta de producción.
      registerType: 'autoUpdate',
      injectRegister: 'script-defer',
      manifest: false, // usamos public/manifest.webmanifest con theme_color #000000
      includeAssets: [
        'favicon-16.png',
        'favicon-32.png',
        'icons/*.png',
        'img/**/*',
      ],
      workbox: {
        // Precachea el bundle y las fuentes autoalojadas (woff2) para modo offline.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,webmanifest}'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//],
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // Imágenes de producto en Storage: cache-first (inmutables por nombre).
            urlPattern: /^https:\/\/firebasestorage\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'spot24-product-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Respuestas GET de Firestore: network-first con timeout corto.
            // Permite leer catálogo y carrito sin conexión (Workbox), sin
            // cachear nunca escrituras (los POST/PUT no pasan por aquí).
            urlPattern: /^https:\/\/firestore\.googleapis\.com\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'spot24-firestore-cache',
              networkTimeoutSeconds: 8,
              expiration: { maxEntries: 80, maxAgeSeconds: 60 * 60 * 24 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 3000,
    host: true,
    strictPort: true,
    headers: { 'Content-Security-Policy': DEV_CSP },
  },
  preview: {
    port: 3000,
    host: true,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      // Dos entradas: la app (index.html) y el SW de mensajería (sin hash,
      // nombre estable /firebase-messaging-sw.js requerido por FCM).
      input: {
        main: new URL('./index.html', import.meta.url).pathname,
        'firebase-messaging-sw': new URL('./src/firebase-messaging-sw.ts', import.meta.url).pathname,
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'firebase-messaging-sw' ? '[name].js' : 'assets/[name]-[hash].js',
        // Partición de vendors: UN solo chunk para todas las dependencias
        // estáticas y otro para Firebase (lazy: demo no lo descarga).
        // ⚠️ No separar react/react-router de @remix-run/router ni de notistack:
        // al partirlos en chunks distintos se crea un ciclo vendor ↔ react-vendor
        // y el TDZ "Cannot access 'CB' before initialization" rompe la app en
        // producción (el bundler evalúa vendor antes de que exista React).
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('firebase')) return 'firebase-vendor';
          return 'vendor';
        },
      },
    },
  },
});
