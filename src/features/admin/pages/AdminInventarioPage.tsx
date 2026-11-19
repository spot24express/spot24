/**
 * Actualizar inventario (5.151/5.152/5.153, a pedido del dueño).
 * ───────────────────────────────────────────────────────────
 * UNA sola opción (el dueño: «ya no quiero las opciones de importar pdf,
 * solo quiero poder actualizar»): se sube el «REPORTE LISTA DE PRECIOS» en
 * Excel (.xlsx) del ERP y el servidor hace el UPSERT literal:
 *  · código existe → actualiza precio («Precio REF c/Imp», con decimales) y
 *    stock («Existencia»);
 *  · código nuevo → borrador INACTIVO, sin categoría, CON precio y existencia
 *    (el dueño lo completa y lo activa desde el panel donde corresponde).
 * SOLO se escriben los cambios reales (reimportar el mismo archivo es un
 * no-op). Las filas-trampa del ERP («COMPRAS GRAVABLES» / «COMPRAS EXENTAS»)
 * se descartan solas y se cuentan. Los borradores antiguos no se tocan.
 *
 * ENSAYO POR DEFECTO (marcado): el primer botón calcula TODO y no guarda
 * nada; el resumen se revisa y después «Actualizar de verdad».
 *
 * AUDITORÍA (el dueño: «se vea quien lo ejecuto por ultima vez con fecha y
 * hora»): junto al botón vive la tarjeta «Última actualización» con el
 * nombre, el rol y la fecha-hora (hora Venezuela) de la última corrida real,
 * más el historial de las últimas 5. Cada corrida real deja 1 registro en
 * inventoryImports (escrito por el servidor; aquí SOLO lectura).
 *
 * Roles: cajero, gerente y admin (GuardSection en el router + gate del
 * servidor). Delivery no entra y el cliente jamás ve nada de esto.
 */
import { useEffect, useRef, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Button } from '@/shared/components/ui/Button';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { fechaCaracasDe } from '@/shared/lib/tiempos';
import { userMessage, AppError } from '@/shared/lib/errors';
import {
  adminActualizarInventario, historialActualizacionesInventario, ultimaActualizacionInventario,
  validarArchivoActualizar,
  type CorridaInventario, type ImportInventarioResult,
} from '../services/admin.service';

const ROL_ETIQUETA: Record<string, string> = {
  admin: 'Administración',
  gerente: 'Gerencia',
  cajero: 'Caja',
};

function rolLegible(r: string): string {
  return ROL_ETIQUETA[r] ?? r;
}

/** Tarjeta «Última actualización» + historial: la firma junto al botón. */
function TarjetaUltimaActualizacion({
  ultima, historial, cargando,
}: {
  ultima: CorridaInventario | null;
  historial: CorridaInventario[];
  cargando: boolean;
}) {
  if (cargando) {
    return <div className="rounded-brand border-2 border-line bg-ink p-4"><ListSkeleton rows={2} /></div>;
  }
  return (
    <div className="rounded-brand border-2 border-line bg-ink p-4">
      <p className="spot-label">Última actualización</p>
      {ultima ? (
        <>
          <p className="mt-1 font-semibold text-paper">
            {ultima.byName} <span className="text-muted">· {rolLegible(ultima.byRole)}</span>
          </p>
          <p className="text-sm text-muted">{fechaCaracasDe(ultima.at)}</p>
          <p className="mt-1 text-xs text-muted">
            {ultima.archivo} · {ultima.filas} filas · {ultima.precios} precios · {ultima.stocks} existencias
            {ultima.altas ? ` · +${ultima.altas} borradores` : ''} · {ultima.sinCambio} sin cambio
          </p>
        </>
      ) : (
        <p className="mt-1 text-sm text-muted">Aún no se ha actualizado el inventario con el Excel.</p>
      )}
      {historial.length > 1 && (
        <ul className="mt-3 space-y-1 border-t-2 border-line pt-3 text-xs text-muted">
          {historial.slice(1).map((c) => (
            <li key={c.id}>
              {fechaCaracasDe(c.at)} · {c.byName} · {c.precios + c.stocks} cambios · +{c.altas} borradores
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Bloque del resumen del ensayo/ejecución (mismo contrato que el modal viejo). */
function ResumenActualizar({ res }: { res: ImportInventarioResult }) {
  return (
    <div className="rounded-brand border-2 border-line bg-ink p-4 text-sm" data-testid="resumen-actualizar">
      <p className="font-semibold text-paper">
        {res.ensayo && <span className="text-signal">ENSAYO — NADA SE GUARDÓ · </span>}
        {res.filas} filas leídas · archivo Excel del ERP
      </p>
      <p className="mt-1 text-xs text-muted">
        {res.creados} borradores nuevos · {res.actualizados} valores por escribir
        {typeof res.sinCambio === 'number' ? ` · ${res.sinCambio} sin cambio (0 escrituras)` : ''}
        {(res.metaXlsx?.basura ?? 0) > 0 ? ` · ${res.metaXlsx!.basura} filas de basura del ERP ignoradas` : ''}
        {(res.metaXlsx?.descartadasResumen ?? 0) > 0
          ? ` · ${res.metaXlsx!.descartadasResumen} filas de resumen del ERP descartadas (no son productos)`
          : ''}
      </p>

      {(res.cambiosPrecio?.length ?? 0) > 0 && (
        <div className="mt-3">
          <p className="spot-label">Precios {res.ensayo ? 'que se actualizarían' : 'actualizados'} (antes → después)</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-muted">
            {res.cambiosPrecio!.map((c) => (
              <li key={`p-${c.codigo}`}>
                <span className="text-paper">{c.codigo}</span> · {c.nombre.slice(0, 42)} · ${c.antes.toFixed(2)} →{' '}
                <span className="font-semibold text-signal">${c.despues.toFixed(2)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(res.cambiosStock?.length ?? 0) > 0 && (
        <div className="mt-3">
          <p className="spot-label">Existencias {res.ensayo ? 'que se actualizarían' : 'actualizadas'} (antes → después)</p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-muted">
            {res.cambiosStock!.map((c) => (
              <li key={`s-${c.codigo}`}>
                <span className="text-paper">{c.codigo}</span> · {c.nombre.slice(0, 42)} · {c.antes} →{' '}
                <span className="font-semibold text-signal">{c.despues}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(res.altas?.length ?? 0) > 0 && (
        <div className="mt-2">
          <p className="spot-label">
            {res.ensayo ? 'Borradores que se crearían' : 'Borradores creados'} (inactivos, sin categoría, CON precio)
          </p>
          <ul className="mt-1 list-inside list-disc space-y-1 text-xs text-muted">
            {res.altas!.map((a) => (
              <li key={`a-${a.codigo}`}>
                <span className="text-paper">{a.codigo}</span> · {a.nombre} · stock {a.stock}
                {typeof a.precio === 'number' ? ` · $${a.precio.toFixed(2)}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}

      {(res.sinPrecio?.length ?? 0) > 0 && (
        <p className="mt-2 text-xs text-muted">
          <span className="font-semibold text-paper">{res.sinPrecio!.length} artículo(s) NO se les toca el precio</span> (su
          precio en el archivo es 0 o ilegible): {res.sinPrecio!.slice(0, 12).join(', ')}
          {res.sinPrecio!.length > 12 ? '…' : ''}.
        </p>
      )}

      {res.problemas.length > 0 && (
        <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-muted">
          {res.problemas.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}

      {res.ensayo && (
        <p className="mt-3 rounded-brand border-2 border-signal/40 bg-signal/5 p-2 text-xs text-paper">
          Si el resumen te cuadra: desmarca «Modo ensayo» y pulsa «Actualizar de verdad».
        </p>
      )}
    </div>
  );
}

export default function AdminInventarioPage() {
  useDocumentTitle('Actualizar inventario');
  const [ultima, setUltima] = useState<CorridaInventario | null>(null);
  const [historial, setHistorial] = useState<CorridaInventario[]>([]);
  const [cargandoFirma, setCargandoFirma] = useState(true);
  const [errorFirma, setErrorFirma] = useState(false);

  const [archivo, setArchivo] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [resultado, setResultado] = useState<ImportInventarioResult | null>(null);
  // ENSAYO por defecto (decisión del dueño): nada se escribe hasta revisar.
  const [ensayo, setEnsayo] = useState(true);
  const [errorServidor, setErrorServidor] = useState('');
  const [errorArchivo, setErrorArchivo] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const leerFirma = () => {
    setCargandoFirma(true);
    setErrorFirma(false);
    void ultimaActualizacionInventario()
      .then((u) => {
        setUltima(u);
        setErrorFirma(false);
      })
      .catch(() => setErrorFirma(true))
      .finally(() => setCargandoFirma(false));
    void historialActualizacionesInventario()
      .then(setHistorial)
      .catch(() => setErrorFirma(true));
  };

  useEffect(leerFirma, []);

  const elegirArchivo = (file: File | null): void => {
    setResultado(null);
    setErrorServidor('');
    if (!file) {
      setArchivo(null);
      setErrorArchivo('');
      return;
    }
    const problema = validarArchivoActualizar(file.name, file.size);
    setErrorArchivo(problema);
    setArchivo(problema ? null : file);
  };

  const actualizar = async (): Promise<void> => {
    if (!archivo || busy) return;
    setBusy(true);
    setErrorServidor('');
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(String(r.result ?? '').split(',')[1] ?? '');
        r.onerror = () => reject(new Error('No se pudo leer el archivo.'));
        r.readAsDataURL(archivo);
      });
      const res = await adminActualizarInventario(base64, archivo.name, ensayo);
      setResultado(res);
      if (res.ensayo) {
        toast.success(`Ensayo listo: ${res.filas} filas leídas. NADA se guardó.`);
      } else {
        toast.success(`Inventario actualizado: ${res.creados} borradores · ${res.actualizados} valores escritos.`);
        leerFirma(); // la tarjeta «Última actualización» queda con ESTA corrida
      }
    } catch (e) {
      const tecnico = e instanceof AppError && e.message !== userMessage(e) ? e.message : '';
      setErrorServidor(tecnico);
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="font-display text-xl font-bold italic uppercase text-paper">Actualizar inventario</h2>
        <p className="spot-subtitle mt-1">
          Sube el «REPORTE LISTA DE PRECIOS» en Excel del ERP: actualiza precio y stock de los que existen
          y crea los nuevos como borradores inactivos con precio.
        </p>
      </div>

      {/* La firma junto al botón (el dueño: «se vea quien lo ejecuto por ultima vez con fecha y hora»). */}
      {errorFirma ? (
        <div className="rounded-brand border-2 border-line bg-ink p-4 text-sm text-muted">
          No se pudo leer la última actualización (sesión nueva o red). Vuelve a entrar más tarde.
        </div>
      ) : (
        <TarjetaUltimaActualizacion ultima={ultima} historial={historial} cargando={cargandoFirma} />
      )}

      <div className="mt-6 space-y-4">
        <div>
          <p className="mb-2 spot-label">Archivo Excel del ERP (.xlsx)</p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="hidden"
            onChange={(e) => elegirArchivo(e.target.files?.[0] ?? null)}
          />
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => inputRef.current?.click()}>
              {archivo ? 'Cambiar archivo…' : 'Elegir Excel…'}
            </Button>
            {archivo && (
              <span className="min-w-0 truncate text-sm text-paper">
                {archivo.name} · {(archivo.size / 1024).toFixed(0)} KB
              </span>
            )}
          </div>
          {errorArchivo && (
            <p role="alert" className="mt-2 text-xs text-signal">{errorArchivo}</p>
          )}
          <p className="mt-1 text-xs text-muted">
            Sirve el reporte con la columna «Precio REF c/Imp» (el precio final con IVA). Las filas de
            resumen del ERP y los detalles de depósito se descartan solas.
          </p>
        </div>

        {/* ENSAYO por defecto: nada se escribe hasta revisar el resumen. */}
        <label className="flex cursor-pointer items-start gap-3 rounded-brand border-2 border-line p-3">
          <input
            type="checkbox"
            className="mt-1 accent-signal"
            checked={ensayo}
            onChange={(e) => setEnsayo(e.target.checked)}
          />
          <span className="text-sm text-paper">
            Modo ensayo — calcula todo y <span className="font-semibold">NO guarda nada</span>{' '}
            <span className="block text-xs text-muted">
              Recomendado siempre: revisa el resumen (cambios, borradores, protegidos) y luego desmárcalo para actualizar de verdad.
            </span>
          </span>
        </label>

        {errorServidor && (
          <div role="alert" className="rounded-brand border-2 border-line bg-ink p-3 text-sm">
            <p className="font-semibold text-paper">El servidor no pudo actualizar</p>
            <p className="mt-1 text-xs text-muted">Motivo: {errorServidor}</p>
          </div>
        )}

        {resultado && <ResumenActualizar res={resultado} />}

        <div className="flex justify-end gap-3">
          <Button
            variant="secondary"
            onClick={() => {
              setArchivo(null);
              setResultado(null);
              setErrorServidor('');
              setErrorArchivo('');
              if (inputRef.current) inputRef.current.value = '';
            }}
          >
            Limpiar
          </Button>
          <Button
            loading={busy}
            disabled={!archivo || Boolean(errorArchivo)}
            onClick={() => void actualizar()}
          >
            {ensayo ? 'Probar ensayo (no guarda)' : 'Actualizar de verdad'}
          </Button>
        </div>
      </div>
    </div>
  );
}
