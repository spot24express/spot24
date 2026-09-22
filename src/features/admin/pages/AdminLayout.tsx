import { NavLink, Outlet } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { DEMO_MODE } from '@/shared/lib/backend';

const NAV = [
  { to: '/admin/pagos', label: 'Pagos', code: '01' },
  { to: '/admin/despacho', label: 'Despacho', code: '02' },
  { to: '/admin/productos', label: 'Productos', code: '03' },
  { to: '/admin/zonas', label: 'Zonas', code: '04' },
  { to: '/admin/metricas', label: 'Métricas', code: '05' },
] as const;

/** Layout del panel admin: navegación lateral + guard ya aplicado en router. */
export default function AdminLayout() {
  useDocumentTitle('Panel admin');
  return (
    <div className="spot-container py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <SpeedLines className="mb-3" />
          <h1 className="spot-title">Pit stop central</h1>
          <p className="spot-subtitle mt-1">Operación 24/7: pagos, despacho, catálogo y zonas.</p>
        </div>
        {DEMO_MODE && (
          <p className="rounded-brand border-2 border-signal/40 bg-signal/5 px-4 py-2 text-sm font-semibold text-paper">
            Modo demo — datos locales, acciones simuladas
          </p>
        )}
      </div>

      <nav aria-label="Panel admin" className="mb-8 flex flex-wrap gap-2 border-b border-line pb-4">
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              `inline-flex min-h-[44px] items-center gap-2 rounded-brand border-2 px-4 py-2 font-display text-sm font-bold italic uppercase tracking-wide transition-colors ${
                isActive ? 'border-signal bg-signal/10 text-signal' : 'border-line text-paper hover:border-line-strong'
              }`
            }
          >
            <span className="text-muted">{n.code}</span> {n.label}
          </NavLink>
        ))}
      </nav>

      <Outlet />
    </div>
  );
}
