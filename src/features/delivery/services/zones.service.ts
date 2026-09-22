/**
 * Módulo delivery · Zonas de cobertura (lectura pública) y utilidades de cotización.
 * Las tarifas y ventanas son datos públicos; el monto final lo calcula el backend.
 */
import { collection, getDocs, limit as fbLimit, query, where } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { DEMO_MODE } from '@/shared/lib/backend';
import { DEMO_ZONES } from '@/shared/lib/demo/seed';
import type { Zone } from '../types';

export async function listActiveZones(): Promise<Zone[]> {
  if (DEMO_MODE) return DEMO_ZONES.filter((z) => z.active);
  const fb = await loadFirebase();
  if (!fb) return [];
  const snap = await getDocs(
    query(collection(fb.db, 'zones'), where('active', '==', true), fbLimit(50)),
  );
  return snap.docs.map((d) => {
    const z = d.data();
    return {
      id: d.id,
      name: String(z.name ?? ''),
      state: String(z.state ?? ''),
      feeUsd: Number(z.feeUsd ?? 0),
      freeFromUsd: Number(z.freeFromUsd ?? 0),
      weightRateUsdPerKg: Number(z.weightRateUsdPerKg ?? 0),
      baseWeightKg: Number(z.baseWeightKg ?? 5),
      maxWeightKg: Number(z.maxWeightKg ?? 40),
      etaMinMinutes: Number(z.etaMinMinutes ?? 60),
      etaMaxMinutes: Number(z.etaMaxMinutes ?? 120),
      windows: Array.isArray(z.windows) ? (z.windows as Zone['windows']) : [],
      active: z.active !== false,
    };
  });
}

export async function getZone(zoneId: string): Promise<Zone | null> {
  if (DEMO_MODE) return DEMO_ZONES.find((z) => z.id === zoneId) ?? null;
  const zones = await listActiveZones();
  return zones.find((z) => z.id === zoneId) ?? null;
}
