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
  adminGetVariants, adminSetProductImages, adminImportInventory,
  type ImportInventarioResult,
} from '../services/admin.service';
import { adminUploadImage } from '../services/imageUpload.service';
import type { Product, ProductVariant } from '@/features/catalog/types';
import { listCategories } from '@/features/catalog/services/catalog.service';
import { sortAdminCategoryList } from '@/shared/lib/categoryTree';
import { alFallarFoto } from '@/shared/lib/imgFallback';
import type { CategoryDef } from '@/shared/constants/categories';
import { userMessage, AppError } from '@/shared/lib/errors';

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
  // 5.87 · importar inventario desde el PDF del POS.
  const [importing, setImporting] = useState(false);

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
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setImporting(true)}>Importar PDF</Button>
          <Button onClick={() => setCreating(true)}>Nuevo producto</Button>
        </div>
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
                  <img src={p.images[0] ?? '/img/products/lubricantes.svg'} alt="" className="h-14 w-14 rounded-brand border border-line object-cover" loading="lazy" onError={alFallarFoto} />
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

      <ImportarInventarioModal
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => {
          load();
        }}
      />

      <ProductModal
        // 5.75 · FIX: paréntesis. Antes `editing?.id ?? creating ? 'nuevo' :
        // 'cerrado'` agrupaba como `(editing?.id ?? creating) ? …` → al cambiar
        // de producto el key seguía siendo el MISMO id y el modal NO remontaba:
        // el formulario arrastraba nombre/marca/código del producto anterior.
        // Con el key correcto (id del producto, 'nuevo' o 'cerrado') cada
        // apertura monta un formulario limpio.
        key={editing?.id ?? (creating ? 'nuevo' : 'cerrado')}
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
  // 5.81 · MULTIFOTO: lista de fotos (hasta 6). La primera es la portada.
  // initialImagesRef guarda la lista con la que se abrió el modal para saber
  // si cambió y solo entonces escribir en Firestore al guardar.
  const [images, setImages] = useState<string[]>([]);
  const [urlDraft, setUrlDraft] = useState('');
  const initialImagesRef = useRef<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  // Ronda 5.78 · Precio y stock se leen de la variante al abrir el modal. Hasta
  // que esa lectura termina, «Guardar producto» queda BLOQUEADO: si la lectura
  // fallara (red) y el dueño guardara igual, el producto quedaría con precio 0
  // y stock 0 sin que nadie lo note. Producto nuevo no lee nada: listo de una.
  const [metaReady, setMetaReady] = useState(false);
  const imgInputRef = useRef<HTMLInputElement>(null);

  // Categorías vigentes (las que gestiona el admin, con respaldo local).
  useEffect(() => {
    void listCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  // Precio y stock actuales al editar (de la ficha única del producto).
  useEffect(() => {
    const initial = (product?.images ?? []).filter(Boolean);
    setImages(initial);
    initialImagesRef.current = initial;
    setUrlDraft('');
    if (!product) {
      setPriceUsd(0);
      setStock(0);
      setVariantId(undefined);
      setMetaReady(true);
      return;
    }
    setMetaReady(false);
    void adminGetVariants(product.id)
      .then((vs) => {
        const v: ProductVariant | undefined = vs[0];
        setVariantId(v?.id);
        setPriceUsd(v ? v.priceUsd : 0);
        setStock(v ? v.stock : 0);
        setMetaReady(true);
      })
      .catch(() => {
        // Sin catch, un fallo de red dejaba precio/stock en 0 y un guardado
        // posterior los PONÍA EN 0 de verdad. Ahora se avisa y el guardado
        // sigue bloqueado hasta reabrir el producto.
        toast.error('No pudimos leer el precio y el stock actuales. Cierra y vuelve a abrir este producto antes de guardar.');
      });
  }, [product]);

  // Ronda 5.78 · ¿La categoría actual del producto NO está en la lista?
  // listCategories() solo trae las ACTIVAS. Si alguien desactivó u ocultó la
  // categoría de este producto (o la borró a mano en la consola), el select
  // se vería EN BLANCO con el id viejo guardado: el dueño guardaría sin darse
  // cuenta y el producto seguiría invisible en la tienda. Con este aviso se
  // VE el problema y se corrige eligiendo otra categoría de la lista.
  const currentCatMissing = Boolean(
    product &&
      form.categoryId &&
      categories.length > 0 &&
      !categories.some((c) => c.id === form.categoryId),
  );

  const save = async () => {
    // Validación ANTES de tocar Firebase: mensajes claros en vez del aviso genérico.
    if (!metaReady) {
      toast.error('Un momento: todavía leemos el precio y el stock de este producto.');
      return;
    }
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
      const savedId = await adminSaveProduct({
        id: product?.id,
        ...form, // incluye code (normaliza y valida unicidad el servicio)
        imageUrl: images[0]?.trim() ?? '', // portada: el lote del servicio la fija al crear
        variants: [{
          id: variantId,
          name: 'Estándar',
          sku: autoSku,
          priceUsd: price,
          stock: qty,
        }],
      });
      // 5.81 · la lista COMPLETA de fotos se aplica aparte, y SOLO si cambió
      // respecto a la lista con la que se abrió el modal (sin escrituras en vano).
      const want = images.map((u) => u.trim()).filter(Boolean);
      const changed = JSON.stringify(want) !== JSON.stringify(initialImagesRef.current);
      if (product) {
        if (changed) await adminSetProductImages(product.id, want);
      } else if (want.length > 0) {
        await adminSetProductImages(savedId, want);
      }
      toast.success('Producto guardado.');
      onSaved();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const applyImages = async () => {
    if (!product) return;
    setBusy(true);
    try {
      await adminSetProductImages(product.id, images.map((u) => u.trim()).filter(Boolean));
      initialImagesRef.current = images; // sincroniza el «¿cambió?» del guardado
      toast.success('Fotos actualizadas.');
      onSaved();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  // 5.81 · helpers de la lista de fotos. Misma validación que el servicio
  // (https externo o ruta /img/products/ del repo). Devuelve true si entró.
  const addImage = (url: string): boolean => {
    const clean = url.trim();
    if (!/^https:\/\//.test(clean) && !/^\/img\/products\/[A-Za-z0-9._-]+$/.test(clean)) {
      toast.error('Enlace no válido: usa https://… o una ruta /img/products/archivo.svg del repo.');
      return false;
    }
    if (images.includes(clean)) {
      toast.info('Esa foto ya está en la lista.');
      return false;
    }
    if (images.length >= 6) {
      toast.error('Máximo 6 fotos por producto.');
      return false;
    }
    setImages([...images, clean]);
    return true;
  };

  const removeAt = (i: number): void => setImages((list) => list.filter((_, idx) => idx !== i));

  const move = (i: number, dir: -1 | 1): void =>
    setImages((list) => {
      const j = i + dir;
      if (j < 0 || j >= list.length) return list;
      const next = [...list];
      [next[i], next[j]] = [next[j]!, next[i]!];
      return next;
    });

  // Subida real: comprime en el teléfono/PC y guarda en imgbb vía fn-uploadImage.
  // En local la función no existe (404) → mensaje amable; funciona tras el deploy.
  const onPickImage = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      const res = await adminUploadImage(file);
      if (res.ok) {
        if (addImage(res.url)) {
          toast.success('Foto añadida a la lista. Pulsa «Guardar producto» para confirmarla.');
        }
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
          <Select
            label="Categoría"
            value={form.categoryId}
            onChange={(e) => setForm((f) => ({ ...f, categoryId: e.target.value }))}
            required
            hint={
              currentCatMissing
                ? 'La categoría actual de este producto está oculta o eliminada. Elige otra de la lista para que se vea en la tienda.'
                : undefined
            }
          >
            <option value="">Selecciona…</option>
            {/* Ronda 5.78 · la categoría guardada del producto, si hoy no aparece
                en la lista (oculta o borrada), se muestra AVISADA y no en blanco. */}
            {currentCatMissing && (
              <option value={form.categoryId}>
                ⚠ Actual: oculta o eliminada — cámbiala
              </option>
            )}
            {/* Ronda 5.76 · lista jerárquica: principales con su número de bahía,
                subcategorías indentadas (↳). Un producto vive en la principal
                o directamente en una subcategoría. */}
            {sortAdminCategoryList(categories).map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `↳ ${c.name}` : `${c.code ? `${c.code} · ` : ''}${c.name}`}
              </option>
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
        <Textarea label="Descripción (opcional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />

        {/* 5.81 · MULTIFOTO: lista de hasta 6 fotos. La primera es la portada
            (tarjetas y carrito); en la ficha el cliente elige entre todas. */}
        <div>
          <p className="mb-2 spot-label">Fotos del producto (hasta 6 · la primera es la portada)</p>
          {images.length > 0 && (
            <ul className="mb-4 flex flex-wrap gap-3">
              {images.map((url, i) => (
                <li key={`${url}-${i}`}>
                  <div className="relative">
                    <img
                      src={url}
                      alt={`Foto ${i + 1} del producto`}
                      className="h-20 w-20 rounded-brand border-2 border-line object-cover"
                      onError={alFallarFoto}
                    />
                    {i === 0 && (
                      <span className="absolute left-1 top-1 rounded-brand bg-signal px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-label text-paper">
                        Portada
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex justify-center gap-1">
                    <button
                      type="button"
                      aria-label={`Mover la foto ${i + 1} hacia la izquierda`}
                      disabled={i === 0}
                      onClick={() => move(i, -1)}
                      className="rounded-brand border-2 border-line px-2 py-0.5 text-xs font-semibold text-paper transition-colors hover:border-line-strong disabled:opacity-30"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      aria-label={`Quitar la foto ${i + 1}`}
                      onClick={() => removeAt(i)}
                      className="rounded-brand border-2 border-line px-2 py-0.5 text-xs font-semibold text-paper transition-colors hover:border-signal hover:text-signal"
                    >
                      ×
                    </button>
                    <button
                      type="button"
                      aria-label={`Mover la foto ${i + 1} hacia la derecha`}
                      disabled={i === images.length - 1}
                      onClick={() => move(i, 1)}
                      className="rounded-brand border-2 border-line px-2 py-0.5 text-xs font-semibold text-paper transition-colors hover:border-line-strong disabled:opacity-30"
                    >
                      →
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <div>
            <Input
              label="Añadir una foto por enlace"
              value={urlDraft}
              onChange={(e) => setUrlDraft(e.target.value)}
              placeholder="https://…  ·  /img/products/archivo.svg"
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
              <Button
                variant="secondary"
                size="sm"
                disabled={!urlDraft.trim()}
                onClick={() => {
                  if (addImage(urlDraft)) setUrlDraft('');
                }}
              >
                Añadir enlace
              </Button>
              {product && (
                <Button variant="secondary" size="sm" loading={busy} onClick={() => void applyImages()}>
                  Aplicar fotos ahora
                </Button>
              )}
            </div>
            <p className="mt-2 text-xs text-muted">
              Las fotos se comprimen solas antes de subirse. La PRIMERA es la portada (lo que se ve en
              tarjetas y carrito); en la ficha el cliente pasa las fotos con el dedo, como Farmatodo.
              Al guardar el producto, la lista queda aplicada — y editar precio o stock NO las toca:
              solo cambian si agregas, quitas o reordenas fotos.
            </p>
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button className="flex-1" loading={busy} disabled={!metaReady} onClick={() => void save()}>
            Guardar producto
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * 5.87 · Importar inventario (PDF del POS): el dueño sube el reporte
 * «Inventario disponible», elige la categoría donde caerán los productos
 * NUEVOS y el servidor crea lo que falte y actualiza stock+precio de lo que
 * ya existe. El mapeo es fijo: Codigo→código · Descripcion→nombre ·
 * Costo→precio · Existencia→stock.
 */
function ImportarInventarioModal({
  open, onClose, onImported,
}: {
  open: boolean;
  onClose: () => void;
  onImported: () => void;
}) {
  const [categorias, setCategorias] = useState<CategoryDef[]>([]);
  const [catId, setCatId] = useState('');
  const [archivo, setArchivo] = useState<File | null>(null);
  const [omitirCero, setOmitirCero] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<ImportInventarioResult | null>(null);
  // 5.87b · Motivo REAL del servidor en el último intento fallido: los
  // mensajes del backend son estáticos y en español (sin PII) — mostrarlos
  // aquí le dice al dueño QUÉ corregir (PDF ilegible, categoría, tamaño…)
  // sin depender de la consola.
  const [errorServidor, setErrorServidor] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setResultado(null);
    setArchivo(null);
    setErrorServidor('');
    void listCategories()
      .then((c) => setCategorias(sortAdminCategoryList(c)))
      .catch(() => setCategorias([]));
  }, [open]);

  const importar = async (): Promise<void> => {
    if (!archivo || !catId || busy) return;
    if (archivo.size > 4 * 1024 * 1024) {
      toast.error('El PDF pesa más de 4 MB. Exporta el reporte con menos páginas.');
      return;
    }
    setBusy(true);
    setErrorServidor('');
    try {
      const pdfBase64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? '').split(',')[1] ?? '');
        r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        r.readAsDataURL(archivo);
      });
      const res = await adminImportInventory(pdfBase64, catId, omitirCero);
      setResultado(res);
      toast.success(`Importación lista: ${res.creados} nuevos · ${res.actualizados} actualizados.`);
      onImported();
    } catch (e) {
      // El motivo técnico del servidor solo se muestra en flujos de admin
      // (patrón de AdminPaymentsPage): el toast sigue siendo el genérico.
      const tecnico = e instanceof AppError && e.message !== userMessage(e) ? e.message : '';
      setErrorServidor(tecnico);
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Importar inventario (PDF)">
      <div className="space-y-4">
        <p className="text-sm text-muted">
          Sube el reporte «Inventario disponible» de tu sistema. Lo que no exista se
          CREA y lo que ya existe se ACTUALIZA (stock y precio): nombre ← Descripcion,
          código ← Codigo, precio ← Costo, stock ← Existencia.
        </p>
        <Select label="Categoría donde caerán los productos NUEVOS" value={catId} onChange={(e) => setCatId(e.target.value)} required>
          <option value="">Selecciona…</option>
          {sortAdminCategoryList(categorias).map((c) => (
            <option key={c.id} value={c.id}>
              {c.parentId ? `↳ ${c.name}` : c.name}
            </option>
          ))}
        </Select>
        <div>
          <p className="mb-2 spot-label">Reporte en PDF (hasta 4 MB)</p>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            onChange={(e) => {
              setArchivo(e.target.files?.[0] ?? null);
              setResultado(null);
              setErrorServidor('');
            }}
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              {archivo ? 'Cambiar archivo…' : 'Elegir PDF…'}
            </Button>
            {archivo && (
              <span className="min-w-0 truncate text-sm text-paper">
                {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB
              </span>
            )}
          </div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-brand border-2 border-line bg-ink p-3 text-sm text-paper">
          <input
            type="checkbox"
            checked={omitirCero}
            onChange={(e) => setOmitirCero(e.target.checked)}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-signal)]"
          />
          <span>
            Omitir los productos con existencia 0
            <span className="block text-xs text-muted">
              Útil si tu reporte trae muchos en cero: no se crean y los que ya existen no se tocan.
            </span>
          </span>
        </label>
        {errorServidor && (
          <div role="alert" className="rounded-brand border-2 border-line bg-ink p-3 text-sm">
            <p className="font-semibold text-paper">El servidor no pudo importar</p>
            <p className="mt-1 text-xs text-muted">Motivo: {errorServidor}</p>
          </div>
        )}
        {resultado && (
          <div className="rounded-brand border-2 border-line bg-ink p-4 text-sm">
            <p className="font-semibold text-paper">
              {resultado.filas} filas leídas · <span className="text-signal">{resultado.creados} creados</span> ·{' '}
              {resultado.actualizados} actualizados
              {resultado.omitidosCero > 0 && ` · ${resultado.omitidosCero} en cero omitidos`}
            </p>
            {resultado.problemas.length > 0 && (
              <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">
                {resultado.problemas.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted">
              Los productos nuevos salen sin foto (usarán la imagen de la categoría):
              súbeles foto desde Editar cuando quieras.
            </p>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <Button variant="secondary" onClick={onClose}>
            {resultado ? 'Listo' : 'Cancelar'}
          </Button>
          <Button loading={busy} disabled={!archivo || !catId} onClick={() => void importar()}>
            Importar
          </Button>
        </div>
      </div>
    </Modal>
  );
}