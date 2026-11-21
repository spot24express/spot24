/**
 * SPOT 24 · 5.158 · Buscador de zonas del checkout (queja real de un comprador:
 * «no existe nada para buscar la zona y debe scrollear para encontrarla»).
 *
 * Lógica PURA del filtro: el checkout ya carga TODAS las zonas activas en
 * memoria (useZones, caché de 15 min) — filtrar en el cliente cuesta CERO
 * lecturas de Firestore. Las zonas vienen de la función pura; el SelectorZona
 * solo las pinta.
 *
 * Comparación tolerante: minúsculas, SIN tildes («Ibatis» y «ibátis» igual) y
 * contra nombre + estado (por si el dueño divide zonas por estado).
 */

import type { Zone } from '@/features/delivery/types';

/** «Maracay Centro Á» → «maracay centro a» (minúsculas, sin tildes, recortado). */
export function normalizarZonaTexto(v: string): string {
  return String(v ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/**
 * Zonas que coinciden con la consulta. Consulta vacía → TODAS (el buscador
 * nunca oculta opciones que el usuario no pidió filtrar).
 * Coincide por nombre de zona o por estado, contiene (no exige prefijo):
 * «iba» encuentra «Ibatis», «centro» encuentra «Maracay Centro».
 */
export function zonasFiltradas(zonas: readonly Zone[], consulta: string): Zone[] {
  const aguja = normalizarZonaTexto(consulta);
  if (!aguja) return [...zonas];
  return zonas.filter((z) => normalizarZonaTexto(`${z.name} ${z.state}`).includes(aguja));
}
