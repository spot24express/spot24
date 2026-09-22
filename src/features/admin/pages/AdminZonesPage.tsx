import { useEffect, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { adminListZones, adminSaveZone, adminDeleteZone } from '../services/admin.service';
import type { Zone } from '@/features/delivery/types';
import { userMessage } from '@/shared/lib/errors';

/** Gestión de zonas de cobertura con tarifas y ventanas (5.5/5.6). */
export default function AdminZonesPage() {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<Zone | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    void adminListZones()
      .then((z) => {
        setZones(z);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold italic uppercase text-paper">Zonas de cobertura</h2>
          <p className="spot-subtitle mt-1">Tarifas por zona, recargo por peso y ventanas 24/7.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Nueva zona</Button>
      </div>

      {error ? (
        <ErrorState onRetry={load} />
      ) : loading ? (
        <ListSkeleton rows={4} />
      ) : (
        <ul className="space-y-3">
          {zones.map((z) => (
            <li key={z.id} className="flex flex-wrap items-center justify-between gap-4 rounded-brand-lg border-2 border-line bg-surface-1 p-4">
              <div>
                <p className="font-semibold text-paper">{z.name}</p>
                <p className="spot-label mt-0.5">
                  ${z.feeUsd.toFixed(2)} · gratis desde ${z.freeFromUsd.toFixed(2)} · +${z.weightRateUsdPerKg.toFixed(2)}/kg sobre {z.baseWeightKg} kg · {z.etaMinMinutes}-{z.etaMaxMinutes} min · {z.windows.length} ventanas
                </p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" size="sm" onClick={() => setEditing(z)}>
                  Editar
                </Button>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await adminDeleteZone(z.id);
                      toast.success('Zona eliminada.');
                      load();
                    } catch (e) {
                      toast.error(userMessage(e));
                    }
                  }}
                >
                  Eliminar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ZoneModal
        open={editing !== null || creating}
        zone={editing}
        onClose={() => {
          setEditing(null);
          setCreating(false);
        }}
        onSaved={() => {
          setEditing(null);
          setCreating(false);
          load();
        }}
      />
    </div>
  );
}

function ZoneModal({
  open, zone, onClose, onSaved,
}: {
  open: boolean;
  zone: Zone | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: zone?.name ?? '',
    state: zone?.state ?? 'Distrito Capital',
    feeUsd: zone?.feeUsd ?? 2.5,
    freeFromUsd: zone?.freeFromUsd ?? 40,
    weightRateUsdPerKg: zone?.weightRateUsdPerKg ?? 0.4,
    baseWeightKg: zone?.baseWeightKg ?? 5,
    maxWeightKg: zone?.maxWeightKg ?? 40,
    etaMinMinutes: zone?.etaMinMinutes ?? 45,
    etaMaxMinutes: zone?.etaMaxMinutes ?? 90,
    active: zone?.active ?? true,
  });
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    try {
      await adminSaveZone({
        id: zone?.id,
        ...form,
        windows: zone?.windows ?? [
          { start: '08:00', end: '12:00', label: 'Mañana' },
          { start: '12:00', end: '18:00', label: 'Tarde' },
          { start: '18:00', end: '23:59', label: 'Noche 24/7' },
        ],
      });
      toast.success('Zona guardada.');
      onSaved();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const num = (label: string, key: keyof typeof form, step = 0.5) => (
    <Input
      label={label}
      type="number"
      step={step}
      min="0"
      value={String(form[key])}
      onChange={(e) => setForm((f) => ({ ...f, [key]: Number(e.target.value) }))}
    />
  );

  return (
    <Modal open={open} onClose={onClose} title={zone ? 'Editar zona' : 'Nueva zona'} wide>
      <div className="space-y-4">
        <Input label="Nombre de la zona" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
        <Input label="Estado" value={form.state} onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))} />
        <div className="grid gap-4 sm:grid-cols-2">
          {num('Tarifa base USD', 'feeUsd')}
          {num('Envío gratis desde USD', 'freeFromUsd')}
          {num('Recargo por kg USD', 'weightRateUsdPerKg')}
          {num('Kilos base sin recargo', 'baseWeightKg')}
          {num('Peso máximo kg', 'maxWeightKg')}
          {num('ETA mínimo (min)', 'etaMinMinutes', 5)}
          {num('ETA máximo (min)', 'etaMaxMinutes', 5)}
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={busy} onClick={() => void save()}>
            Guardar zona
          </Button>
        </div>
      </div>
    </Modal>
  );
}
