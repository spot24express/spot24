import { useEffect, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Badge';
import { Input, Select, Textarea } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import {
  adminListProducts, adminSaveProduct, adminAdjustStock,
  adminGetVariants, adminUploadProductImage,
} from '../services/admin.service';
import type { Product, ProductVariant } from '@/features/catalog/types';
import { CATEGORIES } from '@/shared/constants/categories';
import { userMessage } from '@/shared/lib/errors';

/** Gestión de productos, variantes, stock y precios (5.6). */
export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    void adminListProducts(search)
      .then((p) => {
        setProducts(p);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, [search]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold italic uppercase text-paper">Productos</h2>
          <p className="spot-subtitle mt-1">Catálogo, variantes y stock. El stock se ajusta con auditoría.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Nuevo producto</Button>
      </div>

      <Input
        label="Buscar por nombre o marca"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      <div className="mt-6">
        {error ? (
          <ErrorState onRetry={load} />
        ) : loading ? (
          <ListSkeleton rows={5} />
        ) : (
          <ul className="space-y-3">
            {products.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-4 rounded-brand-lg border-2 border-line bg-surface-1 p-4">
                <div className="flex min-w-0 items-center gap-4">
                  <img src={p.images[0] ?? '/img/products/lubricantes.svg'} alt="" className="h-14 w-14 rounded-brand border border-line object-cover" loading="lazy" />
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-paper">{p.name}</p>
                    <p className="spot-label">
                      {p.brand} · {p.variantCount} variantes · stock total {p.stockTotal} · ${p.basePriceUsd.toFixed(2)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Chip active={p.active} aria-label={p.active ? 'activo' : 'inactivo'}>
                    {p.active ? 'Activo' : 'Inactivo'}
                  </Chip>
                  <Button variant="secondary" size="sm" onClick={() => setEditing(p)}>
                    Editar
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <ProductModal
        key={editing?.id ?? creating ? 'nuevo' : 'cerrado'}
        open={editing !== null || creating}
        product={editing}
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

/** Editor de producto + variantes + carga de imagen. */
function ProductModal({
  open, product, onClose, onSaved,
}: {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    categoryId: product?.categoryId ?? 'lubricantes',
    description: product?.description ?? '',
    active: product?.active ?? true,
  });
  const [variants, setVariants] = useState<Array<{ name: string; sku: string; priceUsd: number; stock: number; weightKg: number }>>([]);
  const [busy, setBusy] = useState(false);

  // Carga variantes al abrir con producto existente.
  useEffect(() => {
    if (!product) {
      setVariants([{ name: '', sku: '', priceUsd: 0, stock: 0, weightKg: 0 }]);
      return;
    }
    void adminGetVariants(product.id).then((vs) => {
      setVariants(
        vs.map((v: ProductVariant) => ({ name: v.name, sku: v.sku, priceUsd: v.priceUsd, stock: v.stock, weightKg: v.weightKg })),
      );
    });
  }, [product]);

  const save = async () => {
    setBusy(true);
    try {
      await adminSaveProduct({
        id: product?.id,
        ...form,
        variants,
      });
      toast.success('Producto guardado.');
      onSaved();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const adjust = async (index: number, delta: number) => {
    if (!product) return;
    const v = variants[index];
    if (!v) return;
    try {
      await adminAdjustStock(product.id, `v${index + 1}`, delta, 'ajuste desde panel');
      setVariants((vs) => vs.map((x, i) => (i === index ? { ...x, stock: Math.max(0, x.stock + delta) } : x)));
      toast.success('Stock ajustado con auditoría.');
    } catch (e) {
      toast.error(userMessage(e));
    }
  };

  const uploadImage = async (file: File) => {
    if (!product) return;
    try {
      const url = await adminUploadProductImage(product.id, file);
      toast.success('Imagen subida a Storage.');
      void url;
    } catch (e) {
      toast.error(userMessage(e));
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={product ? 'Editar producto' : 'Nuevo producto'} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <Input label="Marca" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} required />
          <Select label="Categoría" value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
            ))}
          </Select>
          <Select label="Estado" value={form.active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === '1' }))}>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </Select>
        </div>
        <Textarea label="Descripción" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />

        <div>
          <p className="mb-2 spot-label">Variantes</p>
          <ul className="space-y-3">
            {variants.map((v, i) => (
              <li key={i} className="grid gap-3 rounded-brand border-2 border-line bg-ink p-4 sm:grid-cols-[1.4fr_1fr_0.8fr_0.8fr_auto]">
                <input aria-label="Variante nombre" placeholder="5W-30 · 4 L" value={v.name} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className="rounded-brand border-2 border-line bg-surface-1 px-3 py-2 text-paper focus:border-signal focus:outline-none" />
                <input aria-label="SKU" placeholder="SKU" value={v.sku} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, sku: e.target.value.toUpperCase() } : x)))} className="rounded-brand border-2 border-line bg-surface-1 px-3 py-2 text-paper focus:border-signal focus:outline-none" />
                <input aria-label="Precio USD" type="number" step="0.5" min="0" placeholder="USD" value={v.priceUsd || ''} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, priceUsd: Number(e.target.value) } : x)))} className="rounded-brand border-2 border-line bg-surface-1 px-3 py-2 text-paper focus:border-signal focus:outline-none" />
                <div className="flex items-center gap-1">
                  <button type="button" aria-label="Restar stock" onClick={() => void adjust(i, -1)} className="min-h-[40px] w-9 rounded-brand border-2 border-line font-bold text-paper hover:bg-surface-2">−</button>
                  <input aria-label="Stock" type="number" min="0" value={v.stock || 0} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, stock: Math.max(0, Number(e.target.value)) } : x)))} className="w-16 rounded-brand border-2 border-line bg-surface-1 px-2 py-2 text-center text-paper focus:border-signal focus:outline-none" />
                  <button type="button" aria-label="Sumar stock" onClick={() => void adjust(i, 1)} className="min-h-[40px] w-9 rounded-brand border-2 border-line font-bold text-paper hover:bg-surface-2">+</button>
                </div>
                <input aria-label="Peso kg" type="number" step="0.1" min="0" placeholder="kg" value={v.weightKg || ''} onChange={(e) => setVariants((vs) => vs.map((x, j) => (j === i ? { ...x, weightKg: Number(e.target.value) } : x)))} className="rounded-brand border-2 border-line bg-surface-1 px-3 py-2 text-paper focus:border-signal focus:outline-none sm:w-20" />
              </li>
            ))}
          </ul>
          <Button variant="ghost" size="sm" className="mt-3" onClick={() => setVariants((vs) => [...vs, { name: '', sku: '', priceUsd: 0, stock: 0, weightKg: 0 }])}>
            + Añadir variante
          </Button>
        </div>

        {product && (
          <div>
            <p className="mb-2 spot-label">Imagen de producto (Storage · jpg/png/webp · máx. 5 MB)</p>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-label="Subir imagen"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void uploadImage(f);
              }}
              className="text-sm text-muted file:mr-3 file:rounded-brand file:border-2 file:border-line file:bg-surface-2 file:px-4 file:py-2 file:text-paper"
            />
          </div>
        )}

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={busy} onClick={() => void save()}>
            Guardar producto
          </Button>
        </div>
      </div>
    </Modal>
  );
}
