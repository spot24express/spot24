import { useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Badge';
import { Input, Select, Textarea } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import {
  adminListProducts, adminSaveProduct, adminDeleteProduct,
  adminGetVariants, adminSetProductImages,
} from '../services/admin.service';
import { adminUploadImage } from '../services/imageUpload.service';
import type { Product, ProductVariant } from '@/features/catalog/types';
import { listCategories } from '@/features/catalog/services/catalog.service';
import type { CategoryDef } from '@/shared/constants/categories';
import { userMessage } from '@/shared/lib/errors';

/**
 * Gestión de productos: precio y stock DIRECTOS, sin variantes ni SKU a la vista.
 * Internamente cada producto guarda una única ficha «Estándar» (invisible para
 * el admin) para que la tienda, el carrito y las compras sigan funcionando igual.
 */
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

  const remove = async (p: Product) => {
    if (!window.confirm(`¿Eliminar «${p.name}»? Esta acción no se puede deshacer.`)) return;
    try {
      await adminDeleteProduct(p.id);
      toast.success('Producto eliminado.');
      load();
    } catch (e) {
      toast.error(userMessage(e));
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold italic uppercase text-paper">Productos</h2>
          <p className="spot-subtitle mt-1">Catálogo con precio y stock directos.</p>
        </div>
        <Button onClick={() => setCreating(true)}>Nuevo producto</Button>
      </div>

      <Input
        label="Buscar por nombre, marca o código"
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
                      {p.brand}
                      {p.code ? ` · ${p.code}` : ''} · Stock {p.stockTotal} · ${p.basePriceUsd.toFixed(2)}
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
                  <Button variant="danger-ghost" size="sm" onClick={() => void remove(p)}>
                    Eliminar
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

/** Editor de producto: datos, precio, stock y foto. */
function ProductModal({
  open, product, onClose, onSaved,
}: {
  open: boolean;
  product: Product | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({
    code: product?.code ?? '',
    name: product?.name ?? '',
    brand: product?.brand ?? '',
    categoryId: product?.categoryId ?? '',
    description: product?.description ?? '',
    active: product?.active ?? true,
  });
  const [priceUsd, setPriceUsd] = useState(0);
  const [stock, setStock] = useState(0);
  const [variantId, setVariantId] = useState<string | undefined>(undefined);
  const [categories, setCategories] = useState<CategoryDef[]>([]);
  const [imageUrl, setImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Categorías vigentes (las que gestiona el admin, con respaldo local).
  useEffect(() => {
    void listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // Precio y stock actuales al editar (de la ficha única del producto).
  useEffect(() => {
    setImageUrl(product?.images?.[0] ?? '');
    if (!product) {
      setPriceUsd(0);
      setStock(0);
      setVariantId(undefined);
      return;
    }
    void adminGetVariants(product.id).then((vs) => {
      const v: ProductVariant | undefined = vs[0];
      setVariantId(v?.id);
      setPriceUsd(v ? v.priceUsd : 0);
      setStock(v ? v.stock : 0);
    });
  }, [product]);

  const save = async () => {
    // Validación ANTES de tocar Firebase: mensajes claros en vez del aviso genérico.
    if (form.code.trim().length < 1) {
      toast.error('Escribe el código del producto.');
      return;
    }
    if (form.name.trim().length < 2) {
      toast.error('El nombre del producto necesita al menos 2 letras.');
      return;
    }
    if (form.brand.trim().length < 1) {
      toast.error('Escribe la marca del producto.');
      return;
    }
    if (!form.categoryId) {
      toast.error('Elige una categoría para el producto.');
      return;
    }
    const price = Number.isFinite(Number(priceUsd)) ? Math.max(0, Math.round(Number(priceUsd) * 100) / 100) : 0;
    const qty = Math.max(0, Math.floor(Number(stock) || 0));
    if (price > 10000) {
      toast.error('El precio no puede pasar de 10.000 USD.');
      return;
    }
    if (qty > 100000) {
      toast.error('El stock no puede pasar de 100.000.');
      return;
    }
    // SKU interno e invisible: derivado de marca+nombre, cumple las reglas (3-40 caracteres).
    const autoSku = `${form.brand}${form.name}`.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'SP24';
    setBusy(true);
    try {
      await adminSaveProduct({
        id: product?.id,
        ...form, // incluye code (normaliza y valida unicidad el servicio)
        imageUrl: imageUrl.trim(),
        variants: [{
          id: variantId,
          name: 'Estándar',
          sku: autoSku,
          priceUsd: price,
          stock: qty,
        }],
      });
      toast.success('Producto guardado.');
      onSaved();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const applyImage = async () => {
    if (!product) return;
    setBusy(true);
    try {
      await adminSetProductImages(product.id, imageUrl ? [imageUrl.trim()] : []);
      toast.success('Imagen actualizada.');
      onSaved();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // Subida real: comprime en el teléfono/PC y guarda en imgbb vía fn-uploadImage.
  // En local la función no existe (404) → mensaje amable; funciona tras el deploy.
  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await adminUploadImage(file);
      if (res.ok) {
        setImageUrl(res.url);
        toast.success('Foto lista. Pulsa «Guardar producto» para confirmarla.');
      } else {
        toast.error(res.message);
      }
    } finally {
      setUploading(false);
      if (imgInputRef.current) imgInputRef.current.value = '';
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={product ? 'Editar producto' : 'Nuevo producto'} wide>
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Nombre" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
          <Input label="Marca" value={form.brand} onChange={(e) => setForm((f) => ({ ...f, brand: e.target.value }))} required />
          <Input
            label="Código"
            value={form.code}
            onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))}
            maxLength={40}
            autoComplete="off"
            placeholder="Ej: AGU-600"
            hint="Lo escribes tú (inventarios, pedidos). Único entre productos y editable."
            required
          />
          <Select label="Categoría" value={form.categoryId} onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))} required>
            <option value="">Selecciona…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.code ? `${c.code} · ` : ''}{c.name}</option>
            ))}
          </Select>
          <Select label="Estado" value={form.active ? '1' : '0'} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === '1' }))}>
            <option value="1">Activo</option>
            <option value="0">Inactivo</option>
          </Select>
          <Input
            label="Precio (USD)"
            type="number"
            min="0"
            step="0.5"
            inputMode="decimal"
            placeholder="0.00"
            value={priceUsd || ''}
            onChange={(e) => setPriceUsd(Number(e.target.value))}
            required
          />
          <Input
            label="Stock (unidades)"
            type="number"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder="0"
            value={stock || 0}
            onChange={(e) => setStock(Math.max(0, Math.floor(Number(e.target.value) || 0)))}
            required
          />
        </div>
        <Textarea label="Descripción" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />

        <div>
          <p className="mb-2 spot-label">Imagen del producto</p>
          <div className="flex items-start gap-4">
            <img
              src={imageUrl || product?.images?.[0] || '/img/products/lubricantes.svg'}
              alt="Vista previa"
              className="h-20 w-20 shrink-0 rounded-brand border-2 border-line object-cover"
            />
            <div className="min-w-0 flex-1">
              <Input
                label="Ruta o URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
                placeholder="Se rellena sola al subir una foto · también acepta https://…"
              />
              <input
                ref={imgInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => void onPickImage(e.target.files?.[0])}
              />
              <div className="mt-3 flex flex-wrap gap-3">
                <Button variant="secondary" size="sm" loading={uploading} onClick={() => imgInputRef.current?.click()}>
                  Subir foto desde el teléfono o PC
                </Button>
                {product && (
                  <Button variant="secondary" size="sm" loading={busy} onClick={() => void applyImage()}>
                    Aplicar imagen ahora
                  </Button>
                )}
              </div>
              <p className="mt-2 text-xs text-muted">
                La foto se comprime sola antes de subirse. Al guardar el producto con la URL puesta, la imagen queda aplicada.
              </p>
            </div>
          </div>
        </div>

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