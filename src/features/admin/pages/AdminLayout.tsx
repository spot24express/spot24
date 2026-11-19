import { NavLink, Outlet } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { NAV, VER_TASA } from '../nav';
import { TasaVigenteCard } from '../components/TasaVigenteCard';
/* NewOrderAlert ya NO se monta aquí (ronda 5i-l): vive en RootLayout para
   cubrir toda la app. Montarlo también aquí duplicaría listener y toasts. */

const SUBTITLE: Record<string, string> = {
  admin: 'Operación 24/7: pagos, despacho, catálogo, zonas, usuarios y ajustes.',
  gerente: 'Gerencia: pagos, despacho, catálogo y métricas. Roles y ajustes sensibles quedan en admin.',
  cajero: 'Turno de caja: confirma pagos por Pago Móvil, deja los pedidos listos y actualiza el inventario.',
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
      {/* 5.155 · Tasa vigente compacta en la cabecera: admin, gerente y cajero
          la ven en TODAS las secciones del panel (el cajero no entra a
          Métricas, pero necesita la tasa del BCV a la vista para cobrar). */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <SpeedLines className="mb-3" />
          <h1 className="spot-title">Pit stop central</h1>
          <p className="spot-subtitle mt-1">{SUBTITLE[role] ?? SUBTITLE['admin']}</p>
        </div>
        {VER_TASA.includes(role) && <TasaVigenteCard />}
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