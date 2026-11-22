import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(
  readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
) as { version: string };
const APP_VERSION = `${pkg.version}-${Date.now()}`;

// CSP de desarrollo: más laxa que producción (HMR necesita eval/inline/ws),
// pero DEBE permitir los dominios que Firebase Auth usa en el navegador:
//   apis.google.com  → script gapi que inicializa el iframe de autenticación
//   *.firebaseapp.com → iframe /__/auth/iframe (phone auth y popups)
//   gstatic/google/recaptcha → reCAPTCHA invisible del login por teléfono
// La CSP estricta de producción vive en netlify.toml (ya los incluye).
const DEV_CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://apis.google.com https://www.gstatic.com https://www.google.com https://www.recaptcha.net",
  "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:",
  "img-src 'self' data: blob: https:",
  "connect-src 'self' ws: wss: https: blob:",
  "worker-src 'self' blob:",
  "frame-src 'self' https://*.firebaseapp.com https://apis.google.com https://www.google.com https://www.recaptcha.net",
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
      // 5.160 · img/**/* SALIÓ del precache: eran ~1 MB de fotos del local
      // descargadas en la primera visita por clientes que quizá nunca bajan
      // hasta ahí, y además DUPLICABAN la regla CacheFirst de /img/* de abajo
      // (que las sirve del teléfono a partir de la primera vista, 30 días).
      // Los favicon e iconos SÍ quedan: la PWA instalada los necesita para
      // pintarse sin red. Redes venezolanas: cada MB de la primera visita cuenta.
      includeAssets: [
        'favicon.ico',
        'favicon-16.png',
        'favicon-32.png',
        'favicon-48.png',
        'icons/*.png',
      ],
      workbox: {
        // Precachea el bundle y las fuentes autoalojadas (woff2) para modo offline.
        globPatterns: ['**/*.{js,css,html,woff2,png,svg,ico,webmanifest}'],
        // 5.105 · jsPDF NO se precachea: es herramienta del PANEL y solo sirve
        // en línea (el export necesita leer Firestore). Sin este ignore, cada
        // cliente de la tienda bajaría ~370 KB al instalarse el SW por algo
        // que jamás abrirá. Redes venezolanas: cada KB cuenta.
        // 5.160 · firebase-storage-vendor NO se precachea: mismo caso. Solo
        // existe en dist si el entorno define VITE_FIREBASE_STORAGE_BUCKET;
        // sin bucket (plan Lite, producción hoy) ni se genera. Y si algún día
        // hay bucket, el chunk se baja SOLO al primer loadFirebase (no en la
        // primera visita de todo el mundo). El browser HTTP cache lo guarda
        // igual (Netlify manda immutable en /assets/).
        globIgnores: ['**/jspdf-vendor-*.js', '**/firebase-storage-vendor-*.js'],
        navigateFallback: '/index.html',
        navigateFallbackDenylist: [/^\/api\//, /^\/\.netlify\//],
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        runtimeCaching: [
          {
            // 5.109 · Fotos del LOCAL servidas del propio sitio (fachada del
            // héroe, mural, equipo, QR). Cache-first como imgbb/Storage: la
            // 1ª visita las baja una vez y a partir de ahí salen del cache
            // SIN red (Netlify no manda caché larga en rutas sin hash —
            // antes se revalidaban en cada visita). El dueño las reemplaza
            // por copia en public/img/; al cambiar el nombre de archivo se
            // refresca, y si mantiene el nombre, la entrada expira en 30 días.
            urlPattern: /\/img\/.+\.(jpg|jpeg|png|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'spot24-local-images',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
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
            // Fix 5.75 · imgbb a prueba de redes venezolanas: TODO lo subido por
            // el panel y los comprobantes de pago viven en imgbb (i.ibb.co,
            // nombres con hash = inmutables). El CDN de imgbb a veces no
            // responde desde redes venezolanas (ERR_CONNECTION_TIMED_OUT):
            // si la imagen ya se vio una vez, el SW la sirve del cache SIN
            // volver a tocar la red. Mismo trato que Storage (CacheFirst).
            urlPattern: /^https:\/\/i\.ibb\.co\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'spot24-imgbb-images',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // 5.160 · HOSTS DE RESPALDO (ronda 5.115): las fotos que aterrizaron
            // en freeimage.host / iili.io, Cloudinary o catbox.moe (las noches
            // de caída de imgbb — comprobantes y fotos de producto) NO tenían
            // el trato CacheFirst que imgbb sí tiene desde 5.75: se
            // re-descargaban en cada visita y jamás aparecían offline. Todas
            // usan nombre con hash = inmutables → CacheFirst idéntico al resto.
            // img-src de la CSP ya permite cualquier https (sin cambio).
            urlPattern: /^https:\/\/(iili\.io|freeimage\.host|res\.cloudinary\.com|files\.catbox\.moe)\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'spot24-respaldo-imagenes',
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
    // Fix 5.75 · netlify dev sirve la página en :8888 y hace proxy HTTP hacia
    // Vite (:3000), pero su proxy NO reenvía el handshake WebSocket del HMR
    // (400). clientPort: 3000 → el navegador conecta el WS de recarga DIRECTO
    // a Vite, sin pasar por el proxy (HTTP sigue por 8888, el WS por 3000).
    // Clave SOLO de desarrollo: el build de producción no la usa.
    hmr: { clientPort: 3000 },
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
        // 5.105 · jsPDF (export de inventario del PANEL) vive en chunk PROPIO:
        // si fuera al vendor genérico, toda la tienda cargaría ~370 KB extra
        // al arranque. @babel/runtime sí queda en vendor (lo comparte todo).
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('firebase')) {
            // 5.160 · Storage en chunk PROPIO: así el «solo si hay bucket» de
            // firebase.ts baja menos bytes SIEMPRE, con o sin la variable de
            // entorno. Dependencia UNIDIRECCIONAL (storage → vendor), mismo
            // patrón de jspdf-vendor: sin ciclo posible vendor↔storage.
            if (
              /[\\/]node_modules[\\/](?:@firebase[\\/](?:storage(?:-compat)?|storage-internal)|firebase[\\/]storage)[\\/]/.test(
                id,
              )
            ) {
              return 'firebase-storage-vendor';
            }
            return 'firebase-vendor';
          }
          if (/[\\/]node_modules[\\/](jspdf|jspdf-autotable|fflate|fast-png)[\\/]/.test(id)) {
            return 'jspdf-vendor';
          }
          return 'vendor';
        },
      },
    },
  },
});