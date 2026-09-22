/** Contratos del módulo delivery (zonas de cobertura, tarifas y ventanas). */

export interface DeliveryWindow {
  /** "08:00" */
  start: string;
  end: string;
  label: string;
}

export interface Zone {
  id: string;
  name: string;
  state: string;
  /** Tarifa base por envío. */
  feeUsd: number;
  /** A partir de este subtotal el envío es gratuito (0 = sin promo). */
  freeFromUsd: number;
  /** Recargo por kilo adicional por encima de baseWeightKg. */
  weightRateUsdPerKg: number;
  baseWeightKg: number;
  maxWeightKg: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  windows: DeliveryWindow[];
  active: boolean;
}

export const ZONES_COLLECTION = 'zones';

export function zoneQuote(zone: Zone, subtotalUsd: number, weightKg: number): { feeUsd: number; etaText: string } {
  if (zone.freeFromUsd > 0 && subtotalUsd >= zone.freeFromUsd) {
    return { feeUsd: 0, etaText: `${zone.etaMinMinutes}-${zone.etaMaxMinutes} min` };
  }
  const extraKg = Math.max(0, Math.ceil(weightKg - zone.baseWeightKg));
  const fee = zone.feeUsd + extraKg * zone.weightRateUsdPerKg;
  return {
    feeUsd: Math.round(fee * 100) / 100,
    etaText: `${zone.etaMinMinutes}-${zone.etaMaxMinutes} min`,
  };
}
