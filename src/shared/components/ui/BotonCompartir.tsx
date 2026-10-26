/**
 * SPOT 24 · Ronda 5.108 · Botón «Compartir» reutilizable.
 * Un solo botón para los tres puntos de la ronda: compartir la APP (héroe
 * del Home), compartir PRODUCTO desde la tarjeta y compartir PRODUCTO en
 * la ficha. La lógica vive en compartir.ts: panel nativo del teléfono
 * (Web Share API) y, en PC, copia el enlace + toast.
 * El estilo lo pone quien lo usa (className): flotante discreto en el
 * héroe, píldora sobre la foto de la tarjeta, fila con texto en la ficha.
 */
import { compartirYavisar } from '@/shared/lib/compartir';

/** Icono «compartir» de 3 nodos (mismo trazo del resto de la app). */
export function ShareIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="18" cy="5" r="2.6" />
      <circle cx="6" cy="12" r="2.6" />
      <circle cx="18" cy="19" r="2.6" />
      <path d="M8.3 10.7l7.4-4.4M8.3 13.3l7.4 4.4" />
    </svg>
  );
}

interface BotonCompartirProps {
  /** Título del panel nativo (nombre de la app o del producto). */
  titulo: string;
  /** Texto que viaja junto al enlace. */
  texto: string;
  /** Enlace completo (absoluto). */
  url: string;
  /** Para analytics: 'app' (héroe) o 'producto' (tarjeta/ficha). */
  tipo: 'app' | 'producto';
  /** Id interno del producto (analytics). */
  itemId?: string;
  /** Etiqueta visible junto al icono (ficha); sin ella, solo icono. */
  label?: string;
  ariaLabel?: string;
  /** Tamaño del icono en px (20 por defecto; 16 en tarjeta). */
  iconSize?: number;
  /** Estilo y posición: lo define cada pantalla. */
  className?: string;
}

export function BotonCompartir({
  titulo,
  texto,
  url,
  tipo,
  itemId,
  label,
  ariaLabel,
  iconSize = 20,
  className,
}: BotonCompartirProps) {
  return (
    <button
      type="button"
      aria-label={ariaLabel ?? `Compartir ${titulo}`}
      onClick={() => void compartirYavisar({ title: titulo, text: texto, url, tipo, itemId })}
      className={className}
    >
      <ShareIcon size={iconSize} />
      {label ? <span>{label}</span> : null}
    </button>
  );
}