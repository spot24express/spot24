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
  /** Tarifa base por envío (plana: la zona define el costo, no el peso). */
  feeUsd: number;
  /** A partir de este subtotal el envío es gratuito (0 = sin promo). */
  freeFromUsd: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  windows: DeliveryWindow[];
  active: boolean;
}

export const ZONES_COLLECTION = 'zones';

export function zoneQuote(zone: Zone, subtotalUsd: number): { feeUsd: number; etaText: string } {
  const etaText = `${zone.etaMinMinutes}-${zone.etaMaxMinutes} min`;
  if (zone.freeFromUsd > 0 && subtotalUsd >= zone.freeFromUsd) {
    return { feeUsd: 0, etaText };
  }
  return { feeUsd: zone.feeUsd, etaText };
}