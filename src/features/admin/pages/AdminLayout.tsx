import { NavLink, Outlet } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { useAuth } from '@/features/auth/hooks/useAuth';

const NAV: ReadonlyArray<{ to: string; label: string; code: string; roles: readonly string[] }> = [
  { to: '/admin/pagos', label: 'Pagos', code: '01', roles: ['admin', 'cajero'] },
  { to: '/admin/despacho', label: 'Despacho', code: '02', roles: ['admin', 'cajero', 'delivery'] },
  { to: '/admin/productos', label: 'Productos', code: '03', roles: ['admin'] },
  { to: '/admin/categorias', label: 'Categorías', code: '04', roles: ['admin'] },
  { to: '/admin/zonas', label: 'Zonas', code: '05', roles: ['admin'] },
  { to: '/admin/usuarios', label: 'Usuarios', code: '06', roles: ['admin'] },
  { to: '/admin/metricas', label: 'Métricas', code: '07', roles: ['admin'] },
];

const SUBTITLE: Record<string, string> = {
  admin: 'Operación 24/7: pagos, despacho, catálogo, zonas y usuarios.',
  cajero: 'Turno de caja: confirma pagos por Pago Móvil y deja los pedidos listos.',
  delivery: 'Ruta activa: toma los pedidos preparados y márcalos al entregar.',
};

/** Layout del panel: navegación lateral filtrada por rol (guard ya aplicado en router). */
export default function AdminLayout() {
  useDocumentTitle('Panel');
  const { user } = useAuth();
  const role = user?.role ?? 'customer';
  const items = NAV.filter((n) => n.roles.includes(role));
  return (
    <div className="spot-container py-8">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <SpeedLines className="mb-3" />
          <h1 className="spot-title">Pit stop central</h1>
          <p className="spot-subtitle mt-1">{SUBTITLE[role] ?? SUBTITLE['admin']}</p>
        </div>
      </div>

      <nav aria-label="Panel" className="mb-8 flex flex-wrap gap-2 border-b border-line pb-4">
        {items.map((n) => (
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