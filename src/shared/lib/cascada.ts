/**
 * 5.111 · Cascada de entrada de tarjetas (estilo de la app de farmacia de referencia, aprobado por el dueño).
 * Lógica PURA (testeable en node, sin navegador): el CSS vive en index.css
 * (@keyframes card-in + .card-enter) y aquí solo se calcula el escalón que cada
 * tarjeta recibe como variable CSS `--cascada`.
 *
 * Contrato con index.css:
 *   .card-enter { animation: card-in 220ms ease-out backwards;
 *                 animation-delay: calc(min(var(--cascada, 0), 12) * 40ms); }
 *
 * El tope vive en DOS lados a propósito (cinturón y tirantes): el CSS acota por
 * si algún valor raro se cuela, y esta lib acota antes de enviarlo. Fundido +
 * subida de 6 px con 40 ms por escalón: la primera tanda de tarjetas entra en
 * media caja (480 ms tope), como en la app de referencia. Cero lecturas nuevas
 * a Firestore: la cascada solo pinta lo que ya estaba en pantalla.
 */
import type { CSSProperties } from 'react';

/** Retardo de cada escalón en ms — MISMO número que el de index.css. */
export const ESCALON_MS = 40;

/** Último escalón con retardo propio: 12 × 40 ms = 480 ms de tope total. */
export const TOPE_ESCALONES = 12;

/**
 * Escalón de la tarjeta en la posición `i` (0, 1, 2…): entero, sin negativos
 * y tocado al tope. Entradas raras (NaN, Infinity, decimales) caen a un valor
 * seguro en vez de romper el retardo: tarjeta 0 = entra de una.
 */
export function escalonCascada(i: number): number {
  if (!Number.isFinite(i)) return 0;
  return Math.max(0, Math.min(Math.floor(i), TOPE_ESCALONES));
}

/** Estilo listo para style={…}: la variable CSS que .card-enter consume. */
export function estiloCascada(i: number): CSSProperties {
  return { '--cascada': escalonCascada(i) } as CSSProperties;
}