import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from './layouts/RootLayout';
import { RouteSkeleton, LoadingScreen } from '@/shared/components/ui/Skeleton';
import { useRequireAuth, useRequirePanel, useAuth } from '@/features/auth/hooks/useAuth';
import type { UserRole } from '@/features/auth/types';

/* Code splitting por ruta (4.4): cada página es un chunk separado. */
const HomePage = lazy(() => import('@/features/catalog/pages/HomePage'));
const CatalogPage = lazy(() => import('@/features/catalog/pages/CatalogPage'));
const ProductPage = lazy(() => import('@/features/catalog/pages/ProductPage'));
const CartPage = lazy(() => import('@/features/cart/pages/CartPage'));
const LoginPage = lazy(() => import('@/features/auth/pages/LoginPage'));
const RegisterPage = lazy(() => import('@/features/auth/pages/RegisterPage'));
const ResetPage = lazy(() => import('@/features/auth/pages/ResetPage'));
const AccountPage = lazy(() => import('@/features/auth/pages/AccountPage'));
const CheckoutPage = lazy(() => import('@/features/checkout/pages/CheckoutPage'));
const CheckoutSuccessPage = lazy(() => import('@/features/checkout/pages/CheckoutSuccessPage'));
const MyOrdersPage = lazy(() => import('@/features/orders/pages/MyOrdersPage'));
const OrderDetailPage = lazy(() => import('@/features/orders/pages/OrderDetailPage'));
const AdminLayout = lazy(() => import('@/features/admin/pages/AdminLayout'));
const AdminProductsPage = lazy(() => import('@/features/admin/pages/AdminProductsPage'));
const AdminCategoriesPage = lazy(() => import('@/features/admin/pages/AdminCategoriesPage'));
const AdminPaymentsPage = lazy(() => import('@/features/admin/pages/AdminPaymentsPage'));
const AdminDispatchPage = lazy(() => import('@/features/admin/pages/AdminDispatchPage'));
const AdminZonesPage = lazy(() => import('@/features/admin/pages/AdminZonesPage'));
const AdminPromosPage = lazy(() => import('@/features/admin/pages/AdminPromosPage'));
const AdminUsersPage = lazy(() => import('@/features/admin/pages/AdminUsersPage'));
const AdminMetricsPage = lazy(() => import('@/features/admin/pages/AdminMetricsPage'));
const AdminSettingsPage = lazy(() => import('@/features/admin/pages/AdminSettingsPage'));

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>;
}

function GuardAuth({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = useRequireAuth();
  if (!ready) return <LoadingScreen />;
  if (!authenticated) return null;
  return <>{children}</>;
}

/** Entrada al panel: admin, cajero o delivery (cada uno ve solo sus secciones). */
function GuardPanel({ children }: { children: React.ReactNode }) {
  const { ready, role } = useRequirePanel();
  if (!ready) return <LoadingScreen />;
  if (!role) return null;
  return <>{children}</>;
}

/** Sección del panel acotada por rol: si no corresponde, devuelve al inicio del panel. */
function GuardSection({ allow, children }: { allow: readonly UserRole[]; children: React.ReactNode }) {
  const { user } = useAuth();
  const role = user?.role;
  if (!role || !allow.includes(role)) return <Navigate to="/admin" replace />;
  return <>{children}</>;
}

/** Índice del panel: redirige a la sección principal de cada rol. */
function PanelIndex() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'delivery' ? '/admin/despacho' : '/admin/pagos'} replace />;
}
export const router = createBrowserRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <Lazy><HomePage /></Lazy> },
      { path: 'catalogo', element: <Lazy><CatalogPage /></Lazy> },
      { path: 'catalogo/:slug', element: <Lazy><ProductPage /></Lazy> },
      { path: 'carrito', element: <Lazy><CartPage /></Lazy> },
      { path: 'cuenta/login', element: <Lazy><LoginPage /></Lazy> },
      { path: 'cuenta/registro', element: <Lazy><RegisterPage /></Lazy> },
      { path: 'cuenta/recuperar', element: <Lazy><ResetPage /></Lazy> },
      { path: 'cuenta', element: <GuardAuth><Lazy><AccountPage /></Lazy></GuardAuth> },
      { path: 'checkout', element: <GuardAuth><Lazy><CheckoutPage /></Lazy></GuardAuth> },
      { path: 'checkout/exito/:orderId', element: <GuardAuth><Lazy><CheckoutSuccessPage /></Lazy></GuardAuth> },
      { path: 'pedidos', element: <GuardAuth><Lazy><MyOrdersPage /></Lazy></GuardAuth> },
      { path: 'pedido/:orderId', element: <GuardAuth><Lazy><OrderDetailPage /></Lazy></GuardAuth> },
      {
        path: 'admin',
        element: <GuardPanel><Lazy><AdminLayout /></Lazy></GuardPanel>,
        children: [
          { index: true, element: <PanelIndex /> },
          { path: 'productos', element: <GuardSection allow={['admin', 'gerente']}><Lazy><AdminProductsPage /></Lazy></GuardSection> },
          { path: 'categorias', element: <GuardSection allow={['admin', 'gerente']}><Lazy><AdminCategoriesPage /></Lazy></GuardSection> },
          { path: 'pagos', element: <GuardSection allow={['admin', 'gerente', 'cajero']}><Lazy><AdminPaymentsPage /></Lazy></GuardSection> },
          { path: 'despacho', element: <GuardSection allow={['admin', 'gerente', 'cajero', 'delivery']}><Lazy><AdminDispatchPage /></Lazy></GuardSection> },
          { path: 'zonas', element: <GuardSection allow={['admin', 'gerente']}><Lazy><AdminZonesPage /></Lazy></GuardSection> },
          { path: 'promos', element: <GuardSection allow={['admin', 'gerente']}><Lazy><AdminPromosPage /></Lazy></GuardSection> },
          { path: 'usuarios', element: <GuardSection allow={['admin', 'gerente']}><Lazy><AdminUsersPage /></Lazy></GuardSection> },
          { path: 'metricas', element: <GuardSection allow={['admin', 'gerente']}><Lazy><AdminMetricsPage /></Lazy></GuardSection> },
          { path: 'ajustes', element: <GuardSection allow={['admin']}><Lazy><AdminSettingsPage /></Lazy></GuardSection> },
        ],
      },
      { path: '*', element: <Lazy><HomePage /></Lazy> },
    ],
  },
  /* Opt-in a los flags de v7: elimina las advertencias de consola (no cambia comportamiento).
     v7_startTransition va en <RouterProvider future> (ver App.tsx). */
], {
  future: {
    v7_relativeSplatPath: true,
  },
});