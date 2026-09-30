import { useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Badge';
import { Input, Select } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import {
  adminListPromos, adminSavePromo, adminDeletePromo,
  type PromoDraftInput,
} from '../services/admin.service';
import { adminUploadImage } from '../services/imageUpload.service';
import { userMessage } from '@/shared/lib/errors';

/**
 * Gestión de promociones del carrusel «Visítanos» del Home: crear, editar,
 * ordenar, activar y eliminar. Sin promos activas, el Home muestra el banner
 * de fotos del local (fallback). Las fotos se suben desde el propio panel
 * (imgbb vía fn-uploadImage) o pegando una URL manual.
 */
export default function AdminPromosPage() {
  const [promos, setPromos] = useState<PromoDraftInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<PromoDraftInput | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    void adminListPromos()
      .then((p) => {
        setPromos(p);
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
          <h2 className="font-display text-xl font-bold italic uppercase text-paper">Promociones</h2>
          <p className="spot-subtitle mt-1">El carrusel de ofertas de la sección «Visítanos». Cambios en vivo.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Nueva promo</Button>
      </div>

      {error ? (
        <ErrorState onRetry={load} />
      ) : loading ? (
        <ListSkeleton rows={4} />
      ) : promos.length === 0 ? (
        <p className="rounded-brand-lg border-2 border-dashed border-line bg-surface-1 p-6 text-muted">
          Todavía no hay promociones. Usa «Nueva promo» para crearlas; mientras la lista esté
          vacía (o sin promos activas), el Home muestra el banner de fotos del local.
        </p>
      ) : (
        <ul className="space-y-3">
          {promos.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-4 rounded-brand-lg border-2 border-line bg-surface-1 p-4">
              <div className="flex min-w-0 items-center gap-4">
                <img src={p.imageUrl} alt="" className="h-14 w-24 shrink-0 rounded-brand border border-line object-cover" loading="lazy" />
                <div className="min-w-0">
                  <p className="truncate font-semibold text-paper">{p.title}</p>
                  <p className="spot-label truncate">Orden {p.order} · {p.imageUrl}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Chip active={p.active} aria-label={p.active ? 'activa' : 'inactiva'}>
                  <span className="sr-only">{`Promo ${String(i + 1).padStart(2, '0')}, `}</span>
                  {p.active ? 'Activa' : 'Inactiva'}
                </Chip>
                <Button variant="secondary" size="sm" onClick={() => setEditing(p)}>
                  Editar
                </Button>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={async () => {
                    if (!p.id) return;
                    try {
                      await adminDeletePromo(p.id);
                      toast.success('Promo eliminada.');
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

      <PromoModal
        open={editing !== null || creating}
        promo={editing}
        nextOrder={promos.length ? Math.max(...promos.map((p) => p.order)) + 1 : 1}
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

function PromoModal({
  open, promo, nextOrder, onClose, onSaved,
}: {
  open: boolean;
  promo: PromoDraftInput | null;
  nextOrder: number;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<PromoDraftInput>({
    title: '',
    imageUrl: '',
    active: true,
    order: nextOrder,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Sincroniza el formulario cada vez que se abre (editar X, editar Y o crear):
  // evita arrastrar los valores de la promo anterior.
  useEffect(() => {
    if (!open) return;
    setForm({
      title: promo?.title ?? '',
      imageUrl: promo?.imageUrl ?? '',
      active: promo?.active ?? true,
      order: promo?.order ?? nextOrder,
    });
  }, [open, promo, nextOrder]);

  // Sube la foto elegida al servidor (imgbb) y pone la URL en el formulario.
  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    const res = await adminUploadImage(file);
    setUploading(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setForm((f) => ({ ...f, imageUrl: res.url }));
    toast.success('Imagen subida. Revisa la vista previa.');
  };

  const save = async () => {
    if (form.title.trim().length < 2) {
      toast.error('Ponle un título a la promo.');
      return;
    }
    if (!form.imageUrl.trim()) {
      toast.error('Sube una foto o pega la URL de la imagen.');
      return;
    }
    setBusy(true);
    try {
      await adminSavePromo(form);
      toast.success('Promo guardada. Ya vive en la tienda.');
      onSaved();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={promo ? 'Editar promo' : 'Nueva promo'}>
      <div className="space-y-4">
        <Input
          label="Título de la oferta"
          value={form.title}
          onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
          placeholder="Ej: Cambio de aceite 2x1 este fin de semana"
          required
        />
        <div>
          <p className="mb-2 spot-label">Imagen de la promo</p>
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-32 shrink-0 items-center justify-center overflow-hidden rounded-brand border-2 border-line bg-ink">
              {form.imageUrl ? (
                <img src={form.imageUrl} alt="Vista previa" className="h-full w-full object-cover" />
              ) : (
                <span className="font-display text-xl font-black italic text-surface-3">?</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <Input
                label="URL de la imagen"
                value={form.imageUrl}
                onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))}
                placeholder="https://i.ibb.co/…  ·  /img/promos/tu-foto.jpg"
              />
              <div className="mt-2">
                <Button
                  variant="secondary"
                  size="sm"
                  loading={uploading}
                  onClick={() => imgInputRef.current?.click()}
                >
                  Subir foto desde el teléfono o PC
                </Button>
                <input
                  ref={imgInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    void onPickImage(e.target.files?.[0]);
                    e.target.value = '';
                  }}
                />
              </div>
              <p className="mt-1 text-xs text-muted">
                Al pulsar «Subir foto» eliges la imagen, se comprime sola y queda publicada con un
                enlace https listo para usar. También puedes pegar una URL tuya o una ruta del
                repo (/img/promos/tu-foto.jpg).
              </p>
            </div>
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Orden (menor sale primero)"
            type="number"
            min="0"
            step="1"
            value={String(form.order)}
            onChange={(e) =>
              setForm((f) => ({ ...f, order: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))
            }
          />
          <Select
            label="Estado"
            value={form.active ? '1' : '0'}
            onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === '1' }))}
          >
            <option value="1">Activa (se ve en el Home)</option>
            <option value="0">Inactiva (oculta)</option>
          </Select>
        </div>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={busy} onClick={() => void save()}>
            Guardar promo
          </Button>
        </div>
      </div>
    </Modal>
  );
}