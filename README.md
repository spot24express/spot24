# SPOT 24 · PWA de e-commerce

**Tu parada segura. 24/7.** — Repuestos, servicios automotrices y conveniencia con entrega a domicilio. PWA instalable, catálogo con búsqueda, carrito persistente con fusión de sesión, checkout con los cuatro métodos de pago venezolanos (Pago Móvil, transferencia, Zelle, efectivo), delivery por zonas con seguimiento en vivo y panel admin completo.

## Stack

React 18 · TypeScript (estricto) · Vite 5 · Tailwind 3 (tokens de marca) · Firebase 12 (Auth, Firestore, Storage, Functions, App Check, FCM) · TanStack Query 5 · Zustand 5 · react-router 6 · vite-plugin-pwa (Workbox) · Netlify.

## Arquitectura (modular, secciones 4.1–4.4)

```
src/
├── app/                  # router lazy, layouts, providers
├── features/             # módulos autocontenidos, índice público único
│   ├── catalog/          # home 01–08, listado cursor, búsqueda, ficha
│   ├── cart/             # persistencia invitado/usuario, fusión, stock
│   ├── auth/             # email/contraseña, teléfono, roles por claims
│   ├── checkout/         # 4 pasos, 4 métodos VE, reserva 2 h, idempotencia
│   ├── delivery/         # zonas, tarifas, FCM, tracking en vivo
│   ├── orders/           # estados, timeline, comprobantes
│   └── admin/            # productos, pagos, despacho, zonas, métricas
└── shared/               # UI kit, firebase.ts único, validación, constantes
functions/                # Cloud Functions (orden, BCV, pagos, stock, roles)
```

**Regla dura:** ningún componente toca Firestore/Storage directo — siempre la capa `services/` de su módulo. Ninguna operación sensible en cliente: crear orden, calcular montos, verificar pago, ajustar stock y asignar roles viven en Cloud Functions.

## Modo demo (sin Firebase configurado)

Si no existen las variables `VITE_FIREBASE_*`, la app arranca en **modo demo**: catálogo semilla (8 categorías), zonas de Caracas, carrito local y checkout simulado con idempotencia. Ideal para desarrollo y previews. Al configurar las variables, el modo demo se desactiva automáticamente.

## Desarrollo local

```bash
npm install
cp .env.example .env.local    # completa tus credenciales Firebase (opcional)
npm run dev                   # http://localhost:3000
npm run test                  # pruebas unitarias (carrito, checkout, validación)
npm run test:rules            # requiere emulador: firebase emulators:exec
npm run lint && npm run typecheck && npm run build
```

### Cloud Functions

```bash
cd functions && npm install && npm run build && npm test
```

## Despliegue

Guía completa en **[docs/DESPLIEGUE.md](docs/DESPLIEGUE.md)**: Firebase Console, App Check con reCAPTCHA Enterprise, secretos, GitHub Secrets, variables de Netlify, índices y reglas, y checklist de verificación con `curl`.

## Seguridad

- Reglas Firestore/Storage **deny-by-default** con suite de pruebas (`src/tests/rules/`).
- App Check obligatorio en Firestore, Storage y Functions (`consumeAppCheckToken`).
- El cliente nunca escribe en `orders` — solo `fn-createOrder`, idempotente por clave.
- Rate limiting por ventana en funciones públicas; antifraude (referencias duplicadas, límite horario, monto alto, cuenta nueva) con cola de revisión.
- Datos sensibles cifrados con **AES-256-GCM** en reposo (`ENC_KEY_HEX` como secret).
- Cabeceras estrictas en `netlify.toml`: CSP sin scripts inline, HSTS, DENY, nosniff.
- Mapeo OWASP Top 10 (2021) con archivo y control por riesgo: **[docs/OWASP-MAPPING.md](docs/OWASP-MAPPING.md)**.

## Identidad visual

Negro `#000000` (70%) · blanco `#FFFFFF` (20%) · rojo `#F40901` (10%: CTAs, precios, estados activos). Saira itálica MAYÚSCULAS para titulares/CTAs y Barlow para cuerpo — ambas autoalojadas en `src/assets/fonts` (woff2, `font-display: swap`, sin CDN). Escudo con dos franjas rojas para favicon/íconos (192/512/maskable) y wordmark Master con líneas de velocidad para cabeceras. Tema oscuro, `theme-color: #000000`.

Voz: **"Para. Resuelve. Sigue."** — **"Abierto cuando importa."**
