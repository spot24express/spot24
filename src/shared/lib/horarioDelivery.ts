/**
 * Horario del delivery (5.112-B, pedido del dueño):
 * «quiero que las opciones de entrega sean coherentes con el horario del
 * delivery… si el horario del delivery es de 12:00 pm a 11:59 pm, en el
 * horario comprendido de las 12:00 am hasta las 11:59 am solo estará
 * disponible la opción de retiro en tienda».
 *
 * Cómo funciona:
 * · El dueño guarda la franja en Ajustes (settings/general: deliveryStart y
 *   deliveryEnd, formato HH:MM de 24 horas, HORA DE VENEZUELA).
 * · Ambos vacíos = delivery SIEMPRE disponible: los ajustes viejos no rompen
 *   nada hasta que el dueño guarde la franja por primera vez.
 * · El checkout consulta esto al momento: si el dueño cambia la franja en
 *   Ajustes, el checkout nuevo ya obedece — sin deploy, sin código.
 *
 * Por qué minutos con offset fijo: Venezuela usa UTC-4 todo el año (sin
 * horario de verano desde 2016), así que convertir desde UTC con offset fijo
 * es exacto y da EL MISMO resultado en el navegador y en el servidor.
 */

/** "HH:MM" de 24h bien formado, p. ej. "12:00" o "23:59". */
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function esHHMM(v: string): boolean {
  return HHMM.test(v);
}

/** "12:30" → 750 minutos del día. Llamar solo con esHHMM(v) = true. */
export function hhmmAMinutos(v: string): number {
  const [h = 0, m = 0] = v.split(':').map(Number);
  return h * 60 + m;
}

/** Minuto del día AHORA en Venezuela (0 = 12:00 am … 1439 = 11:59 pm). */
export function minutosAhoraCaracas(d: Date = new Date()): number {
  // Caracas = UTC-4 fijo: local = UTC menos 4 horas. El doble módulo maneja
  // la vuelta de medianoche (p. ej. 03:30 UTC → 11:30 pm → minuto 1410).
  return (((d.getUTCHours() * 60 + d.getUTCMinutes() - 240) % 1440) + 1440) % 1440;
}

/** "12:00" → "12:00 pm", "23:59" → "11:59 pm", "07:05" → "7:05 am". */
export function hhmmBonito(v: string): string {
  if (!esHHMM(v)) return v;
  const [rawH = 0, rawM = 0] = v.split(':').map(Number);
  const h = rawH;
  const m = rawM;
  const sufijo = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${sufijo}`;
}

/** La franja guardada en settings/general (ambos campos en HH:MM o vacíos). */
export interface FranjaDelivery {
  start: string;
  end: string;
}

/**
 * ¿Está el delivery DISPONIBLE ahora mismo?
 * · Sin franja válida (vacía, incompleta o start === end) → true: sin
 *   restricción. Defensivo: datos raros jamás dejan a la tienda sin ventas.
 * · start < end → abierto DENTRO de la franja (p. ej. 12:00–23:59: a las
 *   11:59 am está cerrado, a las 12:00 pm abre, a las 11:59 pm aún abierto).
 * · start > end → franja que CRUZA la medianoche (p. ej. 22:00–02:00).
 */
export function deliveryAbierto(
  franja: FranjaDelivery,
  ahoraMin: number = minutosAhoraCaracas(),
): boolean {
  if (!esHHMM(franja.start) || !esHHMM(franja.end) || franja.start === franja.end) return true;
  const a = hhmmAMinutos(franja.start);
  const b = hhmmAMinutos(franja.end);
  const m = ((ahoraMin % 1440) + 1440) % 1440;
  return a < b ? m >= a && m <= b : m >= a || m <= b;
}
