import { useEffect } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { Logo, SpeedLines } from '@/shared/components/brand/Logo';
import { OfflineBanner } from '@/shared/components/ui/States';
import { useCart } from '@/features/cart/hooks/useCart';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { BRAND } from '@/shared/constants/brand';

function TopBar() {
  const { count } = useCart();
  const { user, isAdmin } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur safe-top">
      <div className="spot-container flex h-16 items-center justify-between gap-4">
        <NavLink to="/" aria-label="SPOT 24 — inicio" className="flex items-center">
          <Logo className="h-8" />
        </NavLink>
        <nav className="flex items-center gap-2" aria-label="Principal">
          {isAdmin && (
            <NavLink
              to="/admin"
              className="hidden rounded-brand px-3 py-2 spot-label hover:bg-surface-2 sm:inline-flex"
            >
              Admin
            </NavLink>
          )}
          {user ? (
            <NavLink
              to="/cuenta"
              className="rounded-brand px-3 py-2 spot-label hover:bg-surface-2"
            >
              Cuenta
            </NavLink>
          ) : (
            <NavLink
              to="/cuenta/login"
              className="rounded-brand px-3 py-2 spot-label hover:bg-surface-2"
            >
              Entrar
            </NavLink>
          )}
          <NavLink
            to="/carrito"
            aria-label={`Carrito, ${count} artículos`}
            className="relative inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-brand border-2 border-line px-3 hover:border-signal"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 4h2l2.4 12.2A2 2 0 0 0 9.36 18H18a2 2 0 0 0 1.96-1.6L21.5 8H6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="10" cy="21" r="1.4" fill="currentColor" />
              <circle cx="17" cy="21" r="1.4" fill="currentColor" />
            </svg>
            {count > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-signal px-1 font-display text-xs font-bold italic text-paper">
                {count > 99 ? '99+' : count}
              </span>
            )}
          </NavLink>
        </nav>
      </div>
    </header>
  );
}

/** Navegación inferior móvil: Inicio, Catálogo, Carrito, Pedidos, Cuenta. */
function BottomNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const items = [
    { to: '/', label: 'Inicio', icon: HomeIcon },
    { to: '/catalogo', label: 'Catálogo', icon: GridIcon },
    { to: '/carrito', label: 'Carrito', icon: CartIcon, badge: count },
    { to: '/pedidos', label: 'Pedidos', icon: TruckIcon },
    { to: user ? '/cuenta' : '/cuenta/login', label: 'Cuenta', icon: UserIcon },
  ];
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ink/95 backdrop-blur sm:hidden safe-bottom"
      aria-label="Navegación inferior"
    >
      <ul className="grid grid-cols-5">
        {items.map((it) => (
          <li key={it.label}>
            <NavLink
              to={it.to}
              end={it.to === '/'}
              className={({ isActive }) =>
                `flex min-h-[56px] flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-semibold uppercase tracking-label ${isActive ? 'text-signal' : 'text-muted'}`
              }
            >
              <it.icon />
              {it.label}
              {typeof it.badge === 'number' && it.badge > 0 && (
                <span className="absolute mt-[-26px] ml-6 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] font-bold text-paper">
                  {it.badge > 9 ? '9+' : it.badge}
                </span>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function Footer() {
  return (
    <footer className="mt-16 border-t border-line bg-surface-1 pb-20 pt-8 sm:pb-8">
      <div className="spot-container">
        <SpeedLines className="mb-4" />
        <p className="font-display text-lg font-bold italic uppercase text-paper">{BRAND.closing}</p>
        <p className="mt-1 spot-label">{BRAND.slogan}</p>
        <p className="mt-4 text-sm text-muted">
          {BRAND.supportPhone} · {BRAND.supportEmail}
        </p>
        <p className="mt-1 text-sm text-muted">
          v{__APP_VERSION__.split('-')[0]} · Repuestos, servicios y conveniencia a domicilio
        </p>
      </div>
    </footer>
  );
}

export function RootLayout() {
  const location = useLocation();
  // Registra el service worker de la PWA (autoUpdate, sin inline script).
  useEffect(() => {
    registerSW({ immediate: true });
  }, []);

  // Scroll al cambiar de ruta.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location.pathname]);

  return (
    <div className="flex min-h-dvh flex-col">
      <OfflineBanner />
      <TopBar />
      <main className="flex-1 pb-16 sm:pb-0">
        <Outlet />
      </main>
      <Footer />
      <BottomNav />
    </div>
  );
}

/* Íconos inline de la navegación (sin dependencias externas). */
function Icon({ children }: { children: React.ReactNode }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
function HomeIcon() {
  return (
    <Icon>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </Icon>
  );
}
function GridIcon() {
  return (
    <Icon>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  );
}
function CartIcon() {
  return (
    <Icon>
      <path d="M3 4h2l2.4 12.2A2 2 0 0 0 9.36 18H18a2 2 0 0 0 1.96-1.6L21.5 8H6" />
      <circle cx="10" cy="21" r="1.2" />
      <circle cx="17" cy="21" r="1.2" />
    </Icon>
  );
}
function TruckIcon() {
  return (
    <Icon>
      <path d="M1 8h13v9H1zM14 11h4l3 3v3h-7z" />
      <circle cx="6" cy="19.5" r="1.5" />
      <circle cx="17" cy="19.5" r="1.5" />
    </Icon>
  );
}
function UserIcon() {
  return (
    <Icon>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5" />
    </Icon>
  );
}
