/**
 * SPOT 24 · Logger interno sin datos personales (sección 6.9)
 * ───────────────────────────────────────────────────────────
 * · El usuario siempre recibe mensajes genéricos (ver shared/lib/errors.ts).
 * · El detalle técnico solo va a consola, scrubbed: nunca teléfonos,
 *   direcciones, cédulas ni referencias de pago.
 */

const SENSITIVE_KEYS = [
  'phone', 'telefono', 'cedula', 'address', 'direccion', 'referencia',
  'reference', 'email', 'correo', 'password', 'token', 'comprobante',
] as const;

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.some((s) => k.toLowerCase().includes(s))
        ? '[redacted]'
        : scrub(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 200) return `${value.slice(0, 200)}…`;
  return value;
}

export const logger = {
  debug(...args: unknown[]): void {
    if (import.meta.env.DEV) console.debug('[spot24]', ...args.map(scrub));
  },
  warn(...args: unknown[]): void {
    console.warn('[spot24]', ...args.map(scrub));
  },
  error(...args: unknown[]): void {
    console.error('[spot24]', ...args.map(scrub));
  },
};
