/**
 * SPOT 24 · 5.158 · Selector de zona de cobertura CON BUSCADOR.
 *
 * Reemplaza al <select> nativo en el checkout (queja real de un comprador:
 * la lista de zonas no tiene búsqueda y hay que scrollear para encontrar la
 * propia). Un Input filtra la lista en el cliente — las zonas ya viajan
 * cargadas por useZones: CERO lecturas de Firestore nuevas.
 *
 * Contrato conservado a propósito para no romper nada:
 * · El ESTADO es el mismo de siempre (`address.zoneId` / `tercero.zoneId`):
 *   el componente solo pinta y llama onChange(id) — no toca datos, cotización
 *   ni validación (errors['zoneId'] / errors['terceroZoneId'] siguen existiendo).
 * · El texto de cada fila lo escribe el llamador (`feeTexto`), así la ficha
 *   «nombre · Envío Bs X · N-M min» es idéntica a la que mostraba el <select>
 *   (mismo liveRate, mismo formatBs) y queda en un solo lugar.
 * · Botones SIEMPRE type="button": el checkout es un formulario — un submit
 *   accidental adelantaría pasos.
 * · Accesible: grupo tipo radiogroup + aria-checked en cada opción.
 */

import { useState } from 'react';
import type { Zone } from '@/features/delivery/types';
import { Input } from '@/shared/components/ui/Input';
import { zonasFiltradas } from '../lib/zonas';

interface SelectorZonaProps {
  /** Zonas YA activas (el checkout las filtra: zones?.filter((z) => z.active)). */
  zonas: Zone[] | undefined;
  /** zoneId elegido hoy (address.zoneId / tercero.zoneId — mismos de siempre). */
  value: string;
  onChange: (zoneId: string) => void;
  /** Label del FieldShell del buscador (p. ej. «Zona de cobertura»). */
  label: string;
  /** Texto de tarifa/ETA por zona, idéntico al de las options viejas. */
  feeTexto: (z: Zone) => string;
  /** Mensaje de validación (errors['zoneId'] / errors['terceroZoneId']). */
  error?: string | null;
}

export function SelectorZona({ zonas, value, onChange, label, feeTexto, error }: SelectorZonaProps) {
  const [busqueda, setBusqueda] = useState('');
  const filtroActivo = busqueda.trim().length > 0;
  const filtradas = zonasFiltradas(zonas ?? [], busqueda);

  return (
    <div className="w-full">
      <Input
        label={label}
        type="text"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        placeholder="Escribe para filtrar (ej. Ibatis)…"
        autoComplete="off"
        aria-label={label}
        error={error}
      />
      {zonas === undefined ? (
        <p className="mt-2 rounded-brand border-2 border-dashed border-line bg-ink p-3 text-sm text-muted">
          Cargando zonas de cobertura…
        </p>
      ) : filtradas.length === 0 ? (
        <p className="mt-2 rounded-brand border-2 border-dashed border-line bg-ink p-3 text-sm text-muted">
          {zonas.length === 0
            ? 'Sin zonas de cobertura disponibles por ahora.'
            : `Ninguna zona coincide con «${busqueda.trim()}». Prueba con menos letras.`}
        </p>
      ) : (
        <div
          role="radiogroup"
          aria-label={label}
          className="mt-2 max-h-56 overflow-y-auto rounded-brand border-2 border-line bg-surface-1"
        >
          {filtradas.map((z) => {
            const elegida = z.id === value;
            return (
              <button
                key={z.id}
                type="button"
                role="radio"
                aria-checked={elegida}
                onClick={() => onChange(z.id)}
                className={[
                  'block w-full border-b border-line px-4 py-3 text-left transition-colors last:border-b-0',
                  elegida ? 'bg-signal/10' : 'hover:bg-surface-2',
                ].join(' ')}
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-paper">{z.name}</span>
                  {elegida && <span className="spot-label shrink-0 text-signal">Elegida</span>}
                </span>
                <span className="mt-0.5 block text-xs text-muted">{feeTexto(z)}</span>
              </button>
            );
          })}
        </div>
      )}
      {!filtroActivo && value === '' && !error && (
        <p className="mt-1 text-sm text-muted">
          Tip: escribe unas letras de tu sector y la lista se filtra al instante.
        </p>
      )}
    </div>
  );
}
