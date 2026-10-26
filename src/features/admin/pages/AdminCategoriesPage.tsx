import { useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Badge';
import { Input, Select } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import {
  adminListCategories, adminSaveCategory, adminDeleteCategory, adminCountProductsInCategory,
  adminMoveProductsToCategory,
  type CategoryDraftInput,
} from '../services/admin.service';
import { adminUploadImage } from '../services/imageUpload.service';
import type { CategoryDef } from '@/shared/constants/categories';
import { hasSubcategories, parentOptions, sortAdminCategoryList } from '@/shared/lib/categoryTree';
import { userMessage } from '@/shared/lib/errors';

/**
 * Gestión de categorías desde el panel: crear, editar, eliminar, activar y
 * ponerle imagen (subida directa desde el panel vía imgbb, o URL manual).
 * Ronda 5.76 · SUBCATEGORÍAS: cada categoría puede vivir DENTRO de otra
 * (un solo nivel: principal → subcategorías). Lo que se guarda aquí sale en
 * vivo en la tienda: las principales son las bahías del Home y sus
 * subcategorías aparecen como TARJETAS dentro de su categoría en el catálogo
 * (5.77: con foto opcional y contador de productos, estilo app de conveniencia).
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

  // Lista jerárquica: cada principal seguida de sus subcategorías.
  const sorted = sortAdminCategoryList(categories);

  // 5.81 · Bahías con subcategorías y productos directos: en la tienda esos
  // productos quedan OCULTOS (la bahía con subcategorías solo muestra
  // subcategorías). Se cuentan al cargar para marcarlas con ⚠ mientras duren.
  const [hiddenCounts, setHiddenCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const parents = categories.filter((c) => !c.parentId && hasSubcategories(categories, c.id));
    if (parents.length === 0) {
      setHiddenCounts({});
      return;
    }
    let alive = true;
    void Promise.all(
      parents.map(async (p) => [p.id, await adminCountProductsInCategory(p.id)] as const),
    )
      .then((pairs) => {
        if (alive) setHiddenCounts(Object.fromEntries(pairs));
      })
      .catch(() => {
        /* la marca es informativa: si el conteo falla, la lista sigue igual */
      });
    return () => {
      alive = false;
    };
  }, [categories]);

  const onDelete = async (c: CategoryDef) => {
    // Guarda 1: no se elimina una principal que todavía tiene subcategorías
    // (primero hay que eliminarlas o moverlas a otra categoría).
    if (hasSubcategories(categories, c.id)) {
      toast.error('Esta categoría tiene subcategorías. Elimínalas o muévelas a otra categoría primero.');
      return;
    }
    // Guarda 2: no se elimina una categoría con productos activos — esos
    // productos quedarían fuera de la tienda sin que nadie lo note.
    try {
      const n = await adminCountProductsInCategory(c.id);
      if (n > 0) {
        toast.error(
          `No se puede eliminar: tiene ${n} producto${n === 1 ? '' : 's'} en esa categoría. Mueve esos productos a otra categoría primero.`,
        );
        return;
      }
      await adminDeleteCategory(c.id);
      toast.success('Categoría eliminada.');
      load();
    } catch (e) {
      toast.error(userMessage(e));
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold italic uppercase text-paper">Categorías</h2>
          <p className="spot-subtitle mt-1">
            Las bahías de la tienda. Una categoría puede vivir DENTRO de otra (subcategoría).
          </p>
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
          {sorted.map((c) => {
            const isChild = Boolean(c.parentId);
            const parent = isChild ? categories.find((p) => p.id === c.parentId) : undefined;
            return (
              <li key={c.id} className={isChild ? 'ml-5 sm:ml-10' : ''}>
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-brand-lg border-2 border-line bg-surface-1 p-4">
                  <div className="flex min-w-0 items-center gap-4">
                    {c.imageUrl ? (
                      <img src={c.imageUrl} alt="" className="h-14 w-14 shrink-0 rounded-brand border border-line object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-brand border border-line font-display text-lg font-black italic text-surface-3">
                        {isChild ? '↳' : c.code}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-paper">{c.name}</p>
                      <p className="spot-label truncate">{c.tagline || 'Sin descripción'}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {isChild && (
                      <Chip>
                        Subcategoría{parent ? ` de ${parent.name}` : ''}
                      </Chip>
                    )}
                    {/* 5.81 · productos directos que hoy NO se ven en la tienda
                        porque esta bahía tiene subcategorías. */}
                    {!isChild && (hiddenCounts[c.id] ?? 0) > 0 && (
                      <Chip
                        aria-label={`${hiddenCounts[c.id]} productos directos ocultos en la tienda`}
                        title={`${hiddenCounts[c.id]} producto(s) directo(s) que NO se ven en la tienda: la categoría tiene subcategorías y solo muestra subcategorías. Entra a una subcategoría o edita los productos para moverlos.`}
                      >
                        ⚠ {hiddenCounts[c.id]} directo{(hiddenCounts[c.id] ?? 0) === 1 ? '' : 's'} oculto{(hiddenCounts[c.id] ?? 0) === 1 ? '' : 's'}
                      </Chip>
                    )}
                    <Chip active={c.active !== false} aria-label={c.active !== false ? 'activa' : 'inactiva'}>
                      {c.active !== false ? 'Activa' : 'Inactiva'}
                    </Chip>
                    <Button variant="secondary" size="sm" onClick={() => setEditing(c)}>
                      Editar
                    </Button>
                    <Button variant="danger-ghost" size="sm" onClick={() => void onDelete(c)}>
                      Eliminar
                    </Button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <CategoryModal
        open={editing !== null || creating}
        category={editing}
        categories={categories}
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
  open, category, categories, onClose, onSaved,
}: {
  open: boolean;
  category: CategoryDef | null;
  categories: CategoryDef[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<CategoryDraftInput>({
    name: category?.name ?? '',
    tagline: category?.tagline ?? '',
    imageUrl: category?.imageUrl ?? '',
    active: category?.active !== false,
    parentId: category?.parentId ?? '',
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
      parentId: category?.parentId ?? '',
    });
  }, [open, category]);

  // Una categoría que YA tiene subcategorías debe quedar como principal:
  // si pudiera meterse dentro de otra, sus hijas serían «nietas» (no existe).
  const lockedTopLevel = Boolean(category && hasSubcategories(categories, category.id));
  const candidateParents = parentOptions(categories, category?.id);

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
    // 5.99 · GUARDA ANTI-DUPLICADOS: no se permite crear (ni renombrar hacia)
    // una categoría que ya exista con el mismo nombre en el mismo lugar
    // (mismo padre, o ambas principales). Sin esta guarda, cada reintento de
    // «crear subcategoría» tras un error creaba OTRA igual (pasó de verdad:
    // 4 «Lubricantes» idénticas en producción).
    const nombre = form.name.trim().toLowerCase();
    const duplicada = categories.find(
      (c) =>
        c.id !== form.id &&
        c.name.trim().toLowerCase() === nombre &&
        (c.parentId ?? '') === (form.parentId || ''),
    );
    if (duplicada) {
      toast.error(
        form.parentId
          ? `Ya existe «${duplicada.name}» dentro de esa categoría. Elige otro nombre o usa la que ya está creada.`
          : `Ya existe una categoría principal llamada «${duplicada.name}». Elige otro nombre.`,
      );
      return;
    }
    setBusy(true);
    try {
      // 5.81 · CANDADO «avisar + mover»: si esta categoría va a vivir DENTRO de
      // una bahía que tiene productos directos, en la tienda esa bahía pasará a
      // mostrar SOLO subcategorías y esos productos quedarían ocultos. Se avisa
      // con el número exacto y se ofrecen dos salidas claras en el mismo paso.
      const parentChanged = Boolean(form.parentId) && form.parentId !== (category?.parentId ?? '');
      let moveAfterSave = false;
      if (parentChanged) {
        const n = await adminCountProductsInCategory(form.parentId);
        if (n > 0) {
          const parentName = categories.find((c) => c.id === form.parentId)?.name ?? 'la categoría';
          moveAfterSave = window.confirm(
            `«${parentName}» tiene ${n} producto${n === 1 ? '' : 's'} directo${n === 1 ? '' : 's'}.\n\n` +
              `Al poner «${form.name.trim()}» como subcategoría, la principal solo mostrará subcategorías y esos productos quedarán OCULTOS en la tienda.\n\n` +
              `Aceptar = moverlos ahora a «${form.name.trim()}» (recomendado)\nCancelar = dejarlos donde están`,
          );
        }
      }
      const savedId = await adminSaveCategory(form);
      if (moveAfterSave && savedId) {
        const moved = await adminMoveProductsToCategory(form.parentId, savedId);
        toast.success(
          `Categoría guardada · ${moved} producto${moved === 1 ? '' : 's'} movido${moved === 1 ? '' : 's'} a «${form.name.trim()}».`,
        );
      } else {
        toast.success('Categoría guardada. Ya vive en la tienda.');
      }
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
        <Select
          label="Ubicación"
          value={form.parentId}
          onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
          disabled={lockedTopLevel}
          hint={
            lockedTopLevel
              ? 'Tiene subcategorías: debe quedar como categoría principal.'
              : 'Principal = una bahía del inicio. Dentro de otra = subcategoría (tarjeta dentro de su categoría en el catálogo).'
          }
        >
          <option value="">Categoría principal (bahía)</option>
          {candidateParents.map((p) => (
            <option key={p.id} value={p.id}>
              Dentro de: {p.code ? `${p.code} · ` : ''}{p.name}
            </option>
          ))}
        </Select>
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
                repo (/img/tu-foto.jpg). La foto sale de fondo en la tarjeta de la tienda: en las
                principales (bahías) y TAMBIÉN en las subcategorías (ronda 5.77).
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
