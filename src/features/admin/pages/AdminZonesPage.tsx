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

/** Gestión de zonas de cobertura con tarifas planas y ventanas de entrega (5.5/5.6). */
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
          <p className="spot-subtitle mt-1">Tarifa plana por zona y horario de entrega. El envío no depende del peso.</p>
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
                  ${z.feeUsd.toFixed(2)} · gratis desde ${z.freeFromUsd.toFixed(2)} · {z.etaMinMinutes}-{z.etaMaxMinutes} min · {z.windows.map((w) => w.label).join(' · ')}
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
    state: zone?.state ?? 'Aragua',
    feeUsd: zone?.feeUsd ?? 2.5,
    freeFromUsd: zone?.freeFromUsd ?? 40,
    etaMinMinutes: zone?.etaMinMinutes ?? 45,
    etaMaxMinutes: zone?.etaMaxMinutes ?? 90,
    active: zone?.active ?? true,
  });
  const [windows, setWindows] = useState<Zone['windows']>(
    zone?.windows?.length
      ? zone.windows
      : [{ start: '12:00', end: '23:59', label: '12:00 pm – 12:00 am' }],
  );
  const [busy, setBusy] = useState(false);

  // FIX: el modal vive montado aunque esté cerrado, así que los useState
  // iniciales solo se evaluaron con zone=null (vacíos). Sin esta sincronía,
  // «Editar» abría el formulario sin los datos de la zona. Cada vez que se
  // abre, el formulario se recarga con la zona a editar (o en blanco si es
  // una zona nueva).
  useEffect(() => {
    if (!open) return;
    setForm({
      name: zone?.name ?? '',
      state: zone?.state ?? 'Aragua',
      feeUsd: zone?.feeUsd ?? 2.5,
      freeFromUsd: zone?.freeFromUsd ?? 40,
      etaMinMinutes: zone?.etaMinMinutes ?? 45,
      etaMaxMinutes: zone?.etaMaxMinutes ?? 90,
      active: zone?.active ?? true,
    });
    setWindows(
      zone?.windows?.length
        ? zone.windows
        : [{ start: '12:00', end: '23:59', label: '12:00 pm – 12:00 am' }],
    );
  }, [open, zone]);

  const setWin = (i: number, patch: Partial<Zone['windows'][number]>) =>
    setWindows((ws) => ws.map((w, j) => (j === i ? { ...w, ...patch } : w)));

  const save = async () => {
    if (windows.length === 0 || windows.some((w) => !w.start || !w.end)) {
      toast.error('Cada ventana necesita hora desde y hasta.');
      return;
    }
    setBusy(true);
    try {
      await adminSaveZone({
        id: zone?.id,
        ...form,
        windows: windows.map((w) => ({
          start: w.start,
          end: w.end,
          label: w.label.trim() || `${w.start} – ${w.end}`,
        })),
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
          {num('ETA mínimo (min)', 'etaMinMinutes', 5)}
          {num('ETA máximo (min)', 'etaMaxMinutes', 5)}
        </div>
        <p className="rounded-brand border-2 border-dashed border-line bg-ink p-3 text-xs text-muted">
          La tarifa es fija por zona: el cliente paga ese monto de envío (o nada si su
          compra supera el mínimo de envío gratis). No hay recargos por peso.
        </p>

        {/* Horario de entrega: lo que defines aquí es lo que ve el cliente en el checkout */}
        <div>
          <p className="spot-label mb-2">Horario de entrega (lo ve el cliente en el checkout)</p>
          <div className="space-y-3">
            {windows.map((w, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[140px_140px_1fr_auto]">
                <Input
                  label="Desde"
                  type="time"
                  value={w.start}
                  onChange={(e) => setWin(i, { start: e.target.value })}
                />
                <Input
                  label="Hasta"
                  type="time"
                  value={w.end}
                  onChange={(e) => setWin(i, { end: e.target.value })}
                />
                <Input
                  label="Nombre que ve el cliente"
                  value={w.label}
                  placeholder="Ej.: 12:00 pm – 12:00 am"
                  onChange={(e) => setWin(i, { label: e.target.value })}
                />
                <Button
                  variant="danger-ghost"
                  size="sm"
                  type="button"
                  disabled={windows.length <= 1}
                  onClick={() => setWindows((ws) => ws.filter((_, j) => j !== i))}
                >
                  Quitar
                </Button>
              </div>
            ))}
          </div>
          <Button
            variant="secondary"
            size="sm"
            type="button"
            className="mt-3"
            onClick={() => setWindows((ws) => [...ws, { start: '12:00', end: '23:59', label: '' }])}
          >
            Añadir ventana
          </Button>
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