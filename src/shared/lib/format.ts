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

export function formatInt(amount: number): string {
  return intFmt.format(Number.isFinite(amount) ? amount : 0);
}

/** Peso legible: 0.4 kg → "400 g", 2.5 → "2,5 kg" */
export function formatWeight(kg: number): string {
  if (kg < 1) return `${Math.round(kg * 1000)} g`;
  return `${vesFmt.format(kg)} kg`;
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
