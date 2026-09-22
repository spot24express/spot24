/**
 * SPOT 24 · Identidad oficial del cliente (archivos PNG con fondo
 * transparente, variante sobre negro). Importados por Vite: salen con hash
 * en el bundle y quedan precacheados por el Service Worker.
 * - logo-master.png → wordmark horizontal (header/footer).
 * - escudo.png      → escudo oficial para espacios cuadrados.
 * Los motivos decorativos (líneas de velocidad) siguen siendo SVG ligeros.
 */
import logoMaster from '@/assets/brand/logo-master.png';
import escudo from '@/assets/brand/escudo.png';

export function Logo({ className = 'h-9' }: { className?: string }) {
  return (
    <img
      src={logoMaster}
      alt="SPOT 24 — Tu parada segura. 24/7"
      className={`${className} w-auto`}
      draggable={false}
    />
  );
}

/**
 * Escudo oficial: favicon, ícono PWA y espacios cuadrados (éxito de
 * checkout, pantallas de marca).
 */
export function LogoShield({ className = 'h-10 w-10' }: { className?: string }) {
  return <img src={escudo} alt="SPOT 24" className={className} draggable={false} />;
}

/**
 * Las tres líneas de velocidad del logo como motivo decorativo:
 * divisores, skeletons y estados vacíos (sección 2.6).
 */
export function SpeedLines({
  className = '',
  animated = false,
  tone = 'signal',
}: {
  className?: string;
  animated?: boolean;
  tone?: 'signal' | 'muted';
}) {
  const color = tone === 'signal' ? '#F40901' : '#404040';
  return (
    <div className={`flex items-center gap-2 ${className}`} aria-hidden="true">
      {[64, 44, 26].map((w, i) => (
        <span
          key={w}
          className={`inline-block h-1.5 rounded-brand ${animated ? 'animate-skeleton-pulse' : ''}`}
          style={{
            width: `${w}px`,
            backgroundColor: color,
            opacity: 1 - i * 0.15,
            animationDelay: `${i * 0.12}s`,
          }}
        />
      ))}
    </div>
  );
}

/** Divisor de sección con las tres líneas de velocidad. */
export function SpeedDivider({ className = '' }: { className?: string }) {
  return (
    <div className={`flex items-center gap-4 ${className}`} aria-hidden="true">
      <SpeedLines />
      <div className="h-px flex-1 bg-line" />
    </div>
  );
}
