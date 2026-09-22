# SPOT 24 · Mapeo OWASP Top 10 (2021) — Sección 6.10

Riesgo por riesgo: dónde queda mitigado, en qué archivo, y el control aplicado.

| # | Riesgo | ¿Aplica? | Archivo(s) | Control |
|---|--------|----------|------------|---------|
| **A01** | Broken Access Control | Alta | `firestore.rules` · `storage.rules` · `functions/src/orders.ts` · `functions/src/payments.ts` · `functions/src/admin.ts` | Reglas deny-by-default: la lista blanca es explícita y cualquier ruta no listada cae en `match /{document=**} { allow: if false }`. El cliente jamás escribe `orders`, `reservations`, `counters`, `idempotency`, `auditLog` ni `fraudReview`. Roles por custom claim (`role == 'admin'`) verificados en cada función sensible (`requireAdmin`). Pruebas negativas en `src/tests/rules/firestore.rules.test.ts` demuestran denegación sin App Check/roles. |
| **A02** | Cryptographic Failures | Alta | `functions/src/lib/crypto.ts` · `firestore.rules` | Datos sensibles (teléfono, cédula, dirección completa, referencias de pago) cifrados con **AES-256-GCM** (IV aleatorio por campo, auth tag) antes de persistir; la clave vive en `ENC_KEY_HEX` como secret de Functions, nunca en código. Comprobantes legibles solo por admin/dueño. Transporte: TLS forzado (`upgrade-insecure-requests`, HSTS 2 años con preload en `netlify.toml`). Hash SHA-256 para comparar referencias sin almacenarlas en claro. |
| **A03** | Injection | Alta | `src/shared/lib/validation.ts` · `functions/src/orders.ts` (`sanitizeStr`/`sanitizeDigits`) · `src/shared/lib/logger.ts` | Toda entrada cliente y servidor se sanitiza (eliminación de caracteres de control, recorte de longitud, dígitos-only en números de referencia, listas blancas de `paymentMethod`). React escapa por defecto (no hay `dangerouslySetInnerHTML`). Firestore no admite inyección NoSQL al usar API tipada con validación de tipos previa. Sin `eval` ni scripts inline (CSP). |
| **A04** | Insecure Design | Alta | `functions/src/orders.ts` · `src/shared/constants/orders.ts` + `functions/src/domain/order-state.ts` | Diseño defensivo: la orden la crea EXCLUSIVAMENTE la Cloud Function con transacción; máquina de estados de transiciones permitidas (el backend es fuente de verdad); reserva de stock con TTL 2 h verificada (dueño + estado + vigencia) antes de consumir; totales calculados solo en servidor con precios leídos de Firestore. |
| **A05** | Security Misconfiguration | Media | `netlify.toml` · `firebase.json` · `firestore.rules` | CSP estricta sin scripts inline (solo dominios Firebase/reCAPTCHA), HSTS preload, X-Frame-Options DENY, nosniff, Referrer-Policy estricta, Permissions-Policy mínima, `object-src 'none'`, `base-uri 'self'`. Service worker y manifest sin caché. Reglas publicadas con suite de pruebas que falla el CI si algo se abre. |
| **A06** | Vulnerable Components | Media | `.github/dependabot.yml` · `.github/workflows/ci.yml` | Dependabot activo (npm + functions) semanal; el pipeline bloquea el merge si lint/tipos/pruebas/build fallan. Versiones pinneadas en `package.json`. |
| **A07** | Auth Failures | Alta | `src/features/auth/` · `functions/src/admin.ts` · `functions/src/lib/ratelimit.ts` | Firebase Auth con contraseña ≥ 6 y verificación de correo; teléfono con reCAPTCHA invisible; recuperación sin enumeración de usuarios (respuesta neutra en `ResetPage`); cierre de sesión remoto por época (`sessionEpoch` + `revokeRefreshTokens`); rotación de tokens nativa; rate limiting en login-adjacentes (`fn-createOrder` 5/h, reserva 30/h) y bloqueo temporal por agotamiento (`resource-exhausted`). |
| **A08** | Integrity Failures | Media | `functions/src/orders.ts` (idempotencia) · `src/features/checkout/lib/idempotency.ts` | Idempotencia por clave con re-chequeo dentro de la transacción: reintentos nunca duplican órdenes. Despliegues atómicos de Netlify con rollback; assets con hash inmutable; SW auto-update. Auditoría inmutable (`auditLog` solo escritura vía Functions) para cada acción admin. |
| **A09** | Logging Failures | Media | `functions/src/payments.ts` (`writeAudit`) · `src/shared/lib/logger.ts` | Auditoría de acciones admin (verificación de pago, estados, stock, roles) en colección de solo escritura para clientes, sin PII (solo UIDs/IDs internos). Logs del cliente scrubbed: claves sensibles → `[redacted]`, nunca se loguean teléfonos, direcciones ni referencias. Errores de usuario siempre genéricos (`shared/lib/errors.ts`), detalle solo a logs internos. |
| **A10** | SSRF | Baja | `functions/src/rates.ts` | Única función que hace fetch externo: consulta fija a `https://www.bcv.org.ve/` (URL literal, no controlada por usuario), con timeout de 15 s, validación de rango del valor parseado y fallback a la última tasa. No hay más egress. |

## Pruebas negativas de referencia

`src/tests/rules/firestore.rules.test.ts` (ejecutar con `npm run test:rules`):

1. Cliente **sin sesión** intenta `orders.add` → **denegado**.
2. Cliente autenticado intenta `orders.doc(o1).update` → **denegado** (también admin vía reglas: la escritura solo pasa por Functions, que usa el SDK admin).
3. Cliente no dueño lee orden ajena → **denegado**.
4. `auditLog.add` desde admin-cliente → **denegado** (solo SDK admin).
5. `rates.bcv.set` → **denegado** para cualquier cliente.

Con App Check forzado (`enforceAppCheck: true` / `consumeAppCheckToken: true`), toda llamada callable sin token válido es rechazada por la plataforma **antes** de ejecutar el código.
