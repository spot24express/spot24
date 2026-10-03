import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { Logo, LogoShield, SpeedLines } from '@/shared/components/brand/Logo';
import { OfflineBanner } from '@/shared/components/ui/States';
import { useCart } from '@/features/cart/hooks/useCart';
import { useAuth } from '@/features/auth/hooks/useAuth';
import { BRAND } from '@/shared/constants/brand';
import { getGeneralSettings } from '@/shared/services/settings.service';
import { waHref } from '@/shared/lib/whatsapp';

function TopBar() {
  const { count } = useCart();
  const { user, isAdmin } = useAuth();
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-ink/95 backdrop-blur safe-top">
      <div className="spot-container flex h-16 items-center justify-between gap-4">
        <NavLink
          to="/"
          aria-label="SPOT 24 — inicio"
          className="flex items-center gap-2.5"
        >
          <LogoShield className="h-10 w-auto shrink-0" />
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
          <a
            href="https://www.instagram.com/spot24ve?stkn=bzdpOHBqcWRrZnl1"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="SPOT 24 en Instagram"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-brand border-2 border-line hover:border-signal"
          >
            <InstagramIcon size={20} />
          </a>
          <NavLink
            to={user ? '/cuenta' : '/cuenta/login'}
            aria-label={user ? 'Mi cuenta' : 'Entrar'}
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-brand border-2 border-line hover:border-signal"
          >
            <UserIcon size={20} />
          </NavLink>
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
type BottomNavItem = {
  to: string;
  label: string;
  icon: React.ComponentType<NavIconProps>;
  badge?: number;
  home?: boolean;
};

function BottomNav() {
  const { count } = useCart();
  const { user } = useAuth();
  const items: BottomNavItem[] = [
    { to: '/', label: 'Inicio', icon: HomeIcon, home: true },
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
                `relative flex min-h-[60px] flex-col items-center justify-center gap-1 py-1.5 text-[11px] font-semibold uppercase tracking-label ${isActive ? 'text-signal' : 'text-muted'}`
              }
            >
              {({ isActive }) => (
                <>
                  {it.home ? (
                    <span className="flex h-8 items-center justify-center">
                      <LogoShield
                        className={`h-7 w-auto shrink-0 transition ${isActive ? 'scale-110' : 'opacity-40'}`}
                      />
                    </span>
                  ) : (
                    <ShieldBadge active={isActive}>
                      <it.icon size={isActive ? 13 : 20} />
                    </ShieldBadge>
                  )}
                  {it.label}
                  {typeof it.badge === 'number' && it.badge > 0 && (
                    <span className="absolute right-1.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-signal px-1 text-[10px] font-bold text-paper">
                      {it.badge > 9 ? '9+' : it.badge}
                    </span>
                  )}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/**
 * Contenedor con la SILUETA EXACTA del escudo SPOT 24 para los iconos de la
 * barra inferior (patrón Farmatodo: el contorno del logo envuelve el icono
 * del tab ACTIVO).
 * · Path vectorizado desde escudo.png oficial (borde alfa externo, 23 vértices,
 *   viewBox 493×512 = bbox real del escudo → misma forma y tamaño que el tab
 *   Inicio, que usa el PNG real a h-7).
 * · Grosor de trazo 14 unidades = 14px de la fuente (≈0.77px en render h-7),
 *   el mismo grosor de la línea blanca del escudo oficial.
 * · Inactivo : SOLO el icono, sin contorno (20px para equilibrar con el
 *              escudo del tab Inicio).
 * · Activo   : réplica del escudo oficial — relleno negro, contorno blanco
 *              y línea interior roja señal, icono en blanco dentro.
 * Solo se usa en móvil/tablet: la barra inferior no existe en ≥sm.
 */
const SHIELD_PATH =
  'M250 0L229 3L0 63L1 153L5 204L13 253L28 305L46 346L73 388L97 417L139 455L192 489L232 507L248 511L290 494L349 458L379 433L420 387L452 334L465 303L479 255L490 180L492 63Z';

function ShieldBadge({ active, children }: { active: boolean; children: React.ReactNode }) {
  return (
    <span className="relative flex h-8 w-7 items-center justify-center">
      {active && (
        <>
          <svg viewBox="0 0 493 512" className="h-7 w-auto" aria-hidden="true">
            <path
              d={SHIELD_PATH}
              fill="#000000"
              stroke="#FFFFFF"
              strokeWidth={14}
              strokeLinejoin="round"
            />
            <path
              d={SHIELD_PATH}
              fill="none"
              stroke="#F40901"
              strokeWidth={14}
              strokeLinejoin="round"
              transform="translate(246.5 256) scale(0.93) translate(-246.5 -256)"
            />
          </svg>
          <span
            className="absolute inset-0 z-10 flex items-center justify-center text-paper"
            style={{ transform: 'translateY(-1px)' }}
          >
            {children}
          </span>
        </>
      )}
      {!active && <span className="flex items-center justify-center text-muted">{children}</span>}
    </span>
  );
}

/**
 * Botón flotante de WhatsApp de soporte. El número lo fija el admin en
 * /admin/ajustes (settings/general). Sin número guardado: el botón no se muestra.
 */
function WhatsAppFab({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Escribirnos por WhatsApp"
      className="fixed bottom-[76px] right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink bg-[#25D366] shadow-lg transition hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
    >
      <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38c1.45.79 3.08 1.21 4.79 1.21 5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2zm0 18.15c-1.48 0-2.93-.4-4.2-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.26 8.26 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 4.54 0 8.24 3.7 8.24 8.24s-3.7 8.24-8.24 8.24zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.17.25-.64.81-.78.97-.14.17-.29.19-.54.06-.25-.12-1.05-.39-2-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.02-.38.11-.51.11-.11.25-.29.37-.43.12-.14.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.35-.77-1.85-.2-.48-.41-.42-.56-.43h-.48c-.17 0-.43.06-.66.31-.23.25-.87.85-.87 2.07s.89 2.4 1.02 2.57c.12.17 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.23-.16-.48-.29z" />
      </svg>
    </a>
  );
}

function Footer({ waLink }: { waLink: string | null }) {
  return (
    <footer className="mt-16 border-t border-line bg-surface-1 pb-20 pt-8 sm:pb-8">
      <div className="spot-container">
        <SpeedLines className="mb-4" />
        <p className="font-display text-lg font-bold italic uppercase text-paper">{BRAND.closing}</p>
        <p className="mt-1 spot-label">{BRAND.slogan}</p>
        <p className="mt-4 text-sm text-muted">
          {BRAND.supportPhone} · {BRAND.supportEmail}
        </p>
        {waLink && (
          <p className="mt-2">
            <a
              href={waLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-semibold text-signal hover:underline"
            >
              Escríbenos por WhatsApp
            </a>
          </p>
        )}
        <p className="mt-1 text-sm text-muted">
          v{__APP_VERSION__.split('-')[0]} · Repuestos, servicios y conveniencia a domicilio
        </p>
      </div>
    </footer>
  );
}

export function RootLayout() {
  const location = useLocation();
  // WhatsApp de soporte: número fijado por el admin en /admin/ajustes.
  const [waLink, setWaLink] = useState<string | null>(null);
  // Registra el service worker de la PWA (autoUpdate, sin inline script).
  useEffect(() => {
    registerSW({ immediate: true });
    let alive = true;
    void getGeneralSettings()
      .then((g) => {
        if (alive && g) setWaLink(waHref(g.whatsappNumber));
      })
      .catch(() => {
        /* sin ajustes: botón oculto */
      });
    return () => {
      alive = false;
    };
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
      <Footer waLink={waLink} />
      {waLink && <WhatsAppFab href={waLink} />}
      <BottomNav />
    </div>
  );
}

/* Íconos inline de la navegación (sin dependencias externas). */
function Icon({ children, size = 22 }: { children: React.ReactNode; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}
type NavIconProps = { size?: number };
function HomeIcon({ size }: NavIconProps) {
  return (
    <Icon size={size}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </Icon>
  );
}
function GridIcon({ size }: NavIconProps) {
  return (
    <Icon size={size}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </Icon>
  );
}
function CartIcon({ size }: NavIconProps) {
  return (
    <Icon size={size}>
      <path d="M3 4h2l2.4 12.2A2 2 0 0 0 9.36 18H18a2 2 0 0 0 1.96-1.6L21.5 8H6" />
      <circle cx="10" cy="21" r="1.2" />
      <circle cx="17" cy="21" r="1.2" />
    </Icon>
  );
}
function TruckIcon({ size }: NavIconProps) {
  return (
    <Icon size={size}>
      <path d="M1 8h13v9H1zM14 11h4l3 3v3h-7z" />
      <circle cx="6" cy="19.5" r="1.5" />
      <circle cx="17" cy="19.5" r="1.5" />
    </Icon>
  );
}
function UserIcon({ size }: NavIconProps) {
  return (
    <Icon size={size}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5" />
    </Icon>
  );
}
function InstagramIcon({ size }: NavIconProps) {
  return (
    <Icon size={size}>
      <rect x="2.5" y="2.5" width="19" height="19" rx="5.5" />
      <circle cx="12" cy="12" r="4.2" />
      <circle cx="17.4" cy="6.6" r="1.1" fill="currentColor" stroke="none" />
    </Icon>
  );
}