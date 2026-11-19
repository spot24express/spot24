/**
 * SPOT 24 · Formateo es-VE: USD base y bolívares referenciales (tasa BCV).
 * Los montos en Bs oficiales de una orden siempre vienen del backend; estas
 * funciones solo presentan cifras ya calculadas o valores referenciales.
 */

const usdFmt = new Intl.NumberFormat('es-VE', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const vesFmt = new Intl.NumberFormat('es-VE', {
  style: 'decimal',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const intFmt = new Intl.NumberFormat('es-VE', { maximumFractionDigits: 0 });

export function formatUsd(amount: number): string {
  return usdFmt.format(Number.isFinite(amount) ? amount : 0);
}

export function formatBs(amount: number): string {
  return `Bs. ${vesFmt.format(Number.isFinite(amount) ? amount : 0)}`;
}

/**
 * Convierte USD → Bs con la tasa BCV y redondea a 2 decimales (misma
 * convención del backend al publicar la tasa). Solo para PRESENTACIÓN:
 * el monto oficial de una orden lo fija siempre el backend al cotizar.
 */
export function usdToBs(usd: number, rate: number): number {
  return Math.round(usd * rate * 100) / 100;
}

export function formatInt(amount: number): string {
  return intFmt.format(Number.isFinite(amount) ? amount : 0);
}

/** "hace 5 min" / "hace 2 h" / "hace 3 días" */
export function timeAgo(date: Date | number | string): string {
  const ts = typeof date === 'object' ? date.getTime() : new Date(date).getTime();
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'ahora mismo';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `hace ${d} día${d === 1 ? '' : 's'}`;
  return new Date(ts).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(date: Date | number | string): string {
  const d = typeof date === 'object' ? date : new Date(date);
  return d.toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/** Máscara de referencia de pago: solo últimos 3 dígitos visibles. */
export function maskReference(ref: string): string {
  const clean = ref.trim();
  if (clean.length <= 3) return '•••';
  return `•••${clean.slice(-3)}`;
}

/** Máscara de teléfono: 0414•••••7890 */
export function maskPhone(phone: string): string {
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 4) return '••••';
  return `${clean.slice(0, 4)}•••••${clean.slice(-4)}`;
}

/**
 * RIF listo para app bancaria (5.75): J-12345678-9 → 123456789.
 * Los bancos rechazan letras y guiones al pegar el RIF del beneficiario,
 * así que el botón «Copiar» del checkout entrega SOLO los números.
 */
export function rifToDigits(rif: string): string {
  return rif.replace(/\D/g, '');
}

/**
 * Monto en Bs limpio para pegar en la app del banco (5.75): 1234,56 —
 * sin «Bs.», sin separador de miles y con coma decimal (lo que esperan
 * Banesco/Mercantil/BOD al capturar el monto del pago móvil).
 */
export function cleanAmountBs(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  return safe.toFixed(2).replace('.', ',');
}

/* ── 5.155 · Presentación de la tasa BCV ──
   Antes vivían solo dentro de AdminMetricsPage; ahora también las usa la
   tarjeta compacta «Tasa vigente» de la cabecera del panel (cajero incluido). */

/** Formatea la tasa al estilo venezolano: 916,65 (— si no es válida). */
export function rateText(usdToVes: number): string {
  if (!(usdToVes > 0)) return '—';
  return vesFmt.format(usdToVes);
}

/** «2026-11-18» → «Miércoles, 18 de noviembre de 2026» (— si viene vacía). */
export function fmtFechaValor(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '—';
  const s = new Date(`${iso}T12:00:00`).toLocaleDateString('es-VE', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}