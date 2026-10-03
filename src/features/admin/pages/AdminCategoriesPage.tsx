import { useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Badge';
import { Input, Select } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import {
  adminListCategories, adminSaveCategory, adminDeleteCategory,
  type CategoryDraftInput,
} from '../services/admin.service';
import { adminUploadImage } from '../services/imageUpload.service';
import type { CategoryDef } from '@/shared/constants/categories';
import { userMessage } from '@/shared/lib/errors';

/**
 * Gestión de categorías desde el panel: crear, editar, eliminar, activar y
 * ponerle imagen (subida directa desde el panel vía imgbb, o URL manual).
 * Lo que se guarda aquí sale en vivo en la tienda.
 */
export default function AdminCategoriesPage() {
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<CategoryDef | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    void adminListCategories()
      .then((c) => {
        setCategories(c);
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
          <h2 className="font-display text-xl font-bold italic uppercase text-paper">Categorías</h2>
          <p className="spot-subtitle mt-1">Las bahías de la tienda: nombre, descripción e imagen. Cambios en vivo.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Nueva categoría</Button>
      </div>

      {error ? (
        <ErrorState onRetry={load} />
      ) : loading ? (
        <ListSkeleton rows={4} />
      ) : categories.length === 0 ? (
        <p className="rounded-brand-lg border-2 border-dashed border-line bg-surface-1 p-6 text-muted">
          Todavía no hay categorías creadas en la base de datos. Usa «Nueva categoría» para
          crearlas; mientras la lista esté vacía, la tienda muestra las 8 de respaldo.
        </p>
      ) : (
        <ul className="space-y-3">
          {categories.map((c, i) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-4 rounded-brand-lg border-2 border-line bg-surface-1 p-4">
              <div className="flex min-w-0 items-center gap-4">
                {c.imageUrl ? (
                  <img src={c.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-brand border border-line object-cover" loading="lazy" />
                ) : (
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-brand border border-line font-display text-lg font-black italic text-surface-3">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="truncate font-semibold text-paper">{c.name}</p>
                  <p className="spot-label truncate">{c.tagline || 'Sin descripción'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Chip active={c.active !== false} aria-label={c.active !== false ? 'activa' : 'inactiva'}>
                  {c.active !== false ? 'Activa' : 'Inactiva'}
                </Chip>
                <Button variant="secondary" size="sm" onClick={() => setEditing(c)}>
                  Editar
                </Button>
                <Button
                  variant="danger-ghost"
                  size="sm"
                  onClick={async () => {
                    try {
                      await adminDeleteCategory(c.id);
                      toast.success('Categoría eliminada.');
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

      <CategoryModal
        open={editing !== null || creating}
        category={editing}
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

function CategoryModal({
  open, category, onClose, onSaved,
}: {
  open: boolean;
  category: CategoryDef | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CategoryDraftInput>({
    name: category?.name ?? '',
    tagline: category?.tagline ?? '',
    imageUrl: category?.imageUrl ?? '',
    active: category?.active !== false,
  });
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Sincroniza el formulario cada vez que se abre (editar X, editar Y o crear):
  // sin esto, «Editar» mostraba campos en blanco o valores de otra categoría.
  // El id DEBE viajar en el formulario: sin él, adminSaveCategory interpreta
  // «crear» y duplica la categoría en vez de actualizar la existente.
  useEffect(() => {
    if (!open) return;
    setForm({
      id: category?.id,
      name: category?.name ?? '',
      tagline: category?.tagline ?? '',
      imageUrl: category?.imageUrl ?? '',
      active: category?.active !== false,
    });
  }, [open, category]);

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
    if (form.name.trim().length < 2) {
      toast.error('Ponle un nombre a la categoría.');
      return;
    }
    setBusy(true);
    try {
      await adminSaveCategory(form);
      toast.success('Categoría guardada. Ya vive en la tienda.');
      onSaved();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={category ? 'Editar categoría' : 'Nueva categoría'}>
      <div className="space-y-4">
        <Input
          label="Nombre"
          value={form.name}
          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          placeholder="Ej: Lubricantes"
          required
        />
        <Input
          label="Descripción corta"
          value={form.tagline}
          onChange={(e) => setForm((f) => ({ ...f, tagline: e.target.value }))}
          placeholder="Ej: Aceites y aditivos"
        />
        <div>
          <p className="mb-2 spot-label">Imagen de la tarjeta</p>
          <div className="flex items-start gap-4">
            <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-brand border-2 border-line bg-ink">
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
                placeholder="https://i.ibb.co/…  ·  /img/tu-foto.jpg"
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
                repo (/img/tu-foto.jpg).
              </p>
            </div>
          </div>
        </div>
        <Select
          label="Estado"
          value={form.active ? '1' : '0'}
          onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === '1' }))}
        >
          <option value="1">Activa (se ve en la tienda)</option>
          <option value="0">Inactiva (oculta)</option>
        </Select>
        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={busy} onClick={() => void save()}>
            Guardar categoría
          </Button>
        </div>
      </div>
    </Modal>
  );
}