/**
 * Copias de seguridad del catálogo (5.89, a pedido del dueño).
 * Tres acciones y una lista, todo con el plan gratis (sin Cloud Storage):
 *  · DESCARGAR COPIA → archivo JSON al teléfono/PC (la copia vive con el dueño).
 *  · GUARDAR COPIA EN LA NUBE → snapshot en Firestore (útil antes de cambios
 *    grandes, p. ej. antes de importar inventario).
 *  · AUTOMÁTICAS → una copia diaria a las 6:00 a.m. (Venezuela) la crea el
 *    cron de Netlify; el dueño solo las ve aquí y decide si restaurar.
 *  · RESTAURAR → archivo o copia de la nube, REEMPLAZA el catálogo completo:
 *    doble confirmación (resumen + escribir RESTAURAR). El servidor guarda
 *    SIEMPRE una copia previa del estado actual: volver atrás es posible.
 * Roles: SOLO admin (la restauración es la operación más delicada del panel).
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Badge';
import { Input } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { userMessage } from '@/shared/lib/errors';
import {
  adminExportCatalog, adminListCatalogBackups, adminSaveCatalogBackup, adminRestoreCatalog,
  descargarCopiaArchivo, parseBackupFile, fechaCorta, bytesLegibles,
  type CatalogBackupMeta, type BackupFile, type ResumenCopia,
} from '../services/backups.service';

/** La palabra exacta que el dueño debe escribir para habilitar «Restaurar». */
const PALABRA_CONFIRMACION = 'RESTAURAR';

interface RestauracionEnCurso {
  fuente: 'archivo' | 'nube';
  resumen: ResumenCopia;
  file?: BackupFile;
  snapshotId?: string;
}

export default function AdminBackupsPage() {
  useDocumentTitle('Copias de seguridad');
  const [copias, setCopias] = useState<CatalogBackupMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [busyDescarga, setBusyDescarga] = useState(false);
  const [busyNube, setBusyNube] = useState(false);
  const [busyRestaurar, setBusyRestaurar] = useState(false);
  const [restaurando, setRestaurando] = useState<RestauracionEnCurso | null>(null);
  const [confirmacion, setConfirmacion] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    void adminListCatalogBackups()
      .then((c) => {
        setCopias(c);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  /* Descarga el catálogo ACTUAL como archivo JSON. */
  const descargar = async () => {
    setBusyDescarga(true);
    try {
      const { file } = await adminExportCatalog();
      descargarCopiaArchivo(file);
      toast.success('Copia descargada. Guárdala en un sitio seguro.');
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusyDescarga(false);
    }
  };

  /* Descarga UNA copia guardada en la nube como archivo JSON. */
  const descargarDeNube = async (meta: CatalogBackupMeta) => {
    setBusyNube(true);
    try {
      const { file } = await adminExportCatalog(meta.id);
      descargarCopiaArchivo(file);
      toast.success('Copia descargada. Guárdala en un sitio seguro.');
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusyNube(false);
    }
  };

  /* Guarda el estado actual en la nube (modo manual, rota aparte de las automáticas). */
  const guardarEnNube = async () => {
    setBusyNube(true);
    try {
      await adminSaveCatalogBackup();
      toast.success('Copia guardada en la nube.');
      load();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusyNube(false);
    }
  };

  /* El dueño elige un archivo .json: se valida AQUÍ y se muestra el resumen. */
  const elegirArchivo = async (archivo: File | undefined) => {
    if (!archivo) return;
    try {
      const texto = await archivo.text();
      const parseo = parseBackupFile(texto);
      if (!parseo.ok) {
        toast.error(parseo.motivo);
        return;
      }
      setConfirmacion('');
      setRestaurando({ fuente: 'archivo', resumen: parseo.resumen, file: parseo.file });
    } catch {
      toast.error('No se pudo leer el archivo. Intenta de nuevo.');
    }
  };

  const restaurarDeNube = (meta: CatalogBackupMeta) => {
    setConfirmacion('');
    setRestaurando({
      fuente: 'nube',
      snapshotId: meta.id,
      resumen: {
        categorias: meta.counts.categorias,
        productos: meta.counts.productos,
        variantes: meta.counts.variantes,
        fecha: new Date(meta.createdAt).toISOString(),
      },
    });
  };

  /* Ejecuta la restauración (el servidor valida TODO de nuevo y guarda la copia previa). */
  const confirmarRestauracion = async () => {
    if (!restaurando || confirmacion !== PALABRA_CONFIRMACION) return;
    setBusyRestaurar(true);
    try {
      const r = restaurando.fuente === 'nube'
        ? await adminRestoreCatalog({ snapshotId: restaurando.snapshotId! })
        : await adminRestoreCatalog({ snapshot: restaurando.file! });
      toast.success(
        `Catálogo restaurado: ${r.productos} productos y ${r.categorias} categorías escritos`
        + (r.productosEliminados || r.categoriasEliminadas
          ? `; se quitaron ${r.productosEliminados} productos y ${r.categoriasEliminadas} categorías que no estaban en la copia.`
          : '.'),
      );
      setRestaurando(null);
      setConfirmacion('');
      load();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusyRestaurar(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold italic uppercase text-paper">Copias de seguridad</h2>
        <p className="spot-subtitle mt-1">
          El catálogo completo (productos, variantes, categorías, precios, stock y fotos) respaldado
          a diario. Tu plan gratis alcanza de sobra: las copias son texto y viven dentro de Firebase.
        </p>
      </div>

      <div className="mb-6 rounded-brand-lg border-2 border-line bg-surface-1 p-4">
        <p className="spot-label mb-2">Cómo funcionan tus copias</p>
        <ul className="list-inside list-disc space-y-1 text-sm text-muted">
          <li>Automática: <strong className="text-paper">todos los días a las 6:00 a.m.</strong> (hora de Venezuela) queda guardada una copia en la nube.</li>
          <li>Se conservan las <strong className="text-paper">últimas 30</strong> automáticas y las últimas 30 que guardes a mano.</li>
          <li>Las fotos viajan como enlaces: si una foto se borra de su sitio, el producto se ve con el cartel «FOTO PENDIENTE», nunca roto.</li>
          <li>Restaurar <strong className="text-paper">reemplaza todo el catálogo</strong> con la copia elegida; antes de aplicar, la app guarda una copia del estado actual para poder volver atrás.</li>
        </ul>
      </div>

      <div className="mb-8 flex flex-wrap gap-3">
        <Button loading={busyDescarga} onClick={() => void descargar()}>
          Descargar copia ahora
        </Button>
        <Button variant="secondary" loading={busyNube} onClick={() => void guardarEnNube()}>
          Guardar copia en la nube
        </Button>
        <Button variant="secondary" onClick={() => fileRef.current?.click()}>
          Restaurar desde archivo…
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            void elegirArchivo(e.target.files?.[0]);
            e.target.value = '';
          }}
        />
      </div>

      <p className="spot-label mb-3">
        Copias guardadas en la nube ({copias.length})
      </p>
      {error ? (
        <ErrorState onRetry={load} />
      ) : loading ? (
        <ListSkeleton rows={4} />
      ) : copias.length === 0 ? (
        <p className="rounded-brand-lg border-2 border-dashed border-line bg-surface-1 p-6 text-muted">
          Todavía no hay copias guardadas. La primera automática se creará hoy a las 6:00 a.m.;
          también puedes crear una ahora con «Guardar copia en la nube».
        </p>
      ) : (
        <ul className="space-y-3">
          {copias.map((c, i) => (
            <li
              key={c.id}
              className="flex flex-wrap items-center justify-between gap-4 rounded-brand-lg border-2 border-line bg-surface-1 p-4"
            >
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-paper">
                  <Chip active={c.mode === 'auto'} aria-label={c.mode === 'auto' ? 'automática' : 'manual'}>
                    <span className="sr-only">{`Copia ${String(i + 1).padStart(2, '0')}, `}</span>
                    {c.mode === 'auto' ? 'Automática' : 'Manual'}
                  </Chip>
                  {fechaCorta(c.createdAt)}
                </p>
                <p className="spot-label mt-1 truncate">
                  {c.counts.productos} productos · {c.counts.variantes} variantes · {c.counts.categorias} categorías · {bytesLegibles(c.bytes)}
                  {c.note ? ` · ${c.note}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" loading={busyNube} onClick={() => void descargarDeNube(c)}>
                  Descargar
                </Button>
                <Button variant="secondary" size="sm" onClick={() => restaurarDeNube(c)}>
                  Restaurar
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={restaurando !== null}
        onClose={() => { if (!busyRestaurar) { setRestaurando(null); setConfirmacion(''); } }}
        title="Restaurar copia de seguridad"
      >
        {restaurando && (
          <div className="space-y-4">
            <div className="rounded-brand-lg border-2 border-line bg-surface-1 p-4 text-sm">
              <p className="spot-label mb-2">Esta copia contiene</p>
              <p className="text-paper">
                {fechaCorta(new Date(restaurando.resumen.fecha).getTime())}
                {' · '}{restaurando.resumen.categorias} categorías
                {' · '}{restaurando.resumen.productos} productos
                {' · '}{restaurando.resumen.variantes} variantes
              </p>
            </div>
            <p className="text-sm leading-relaxed text-signal">
              Atención: el catálogo actual será REEMPLAZADO por completo por esta copia — precios,
              stock, fotos y categorías quedarán exactamente como en ese momento. Los pedidos y los
              usuarios NO se tocan. Antes de aplicar, SPOT 24 guardará automáticamente una copia del
              estado actual para que puedas volver atrás.
            </p>
            <Input
              label={`Escribe ${PALABRA_CONFIRMACION} para confirmar`}
              value={confirmacion}
              onChange={(e) => setConfirmacion(e.target.value.toUpperCase())}
              placeholder={PALABRA_CONFIRMACION}
              autoComplete="off"
              spellCheck={false}
            />
            <div className="flex gap-3 pt-2">
              <Button
                variant="secondary"
                disabled={busyRestaurar}
                onClick={() => { setRestaurando(null); setConfirmacion(''); }}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1"
                loading={busyRestaurar}
                disabled={confirmacion !== PALABRA_CONFIRMACION}
                onClick={() => void confirmarRestauracion()}
              >
                Restaurar catálogo
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
