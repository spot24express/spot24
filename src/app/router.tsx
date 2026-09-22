import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import { RootLayout } from './layouts/RootLayout';
import { RouteSkeleton, LoadingScreen } from '@/shared/components/ui/Skeleton';
import { useRequireAuth, useRequireAdmin } from '@/features/auth/hooks/useAuth';

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
const AdminPaymentsPage = lazy(() => import('@/features/admin/pages/AdminPaymentsPage'));
const AdminDispatchPage = lazy(() => import('@/features/admin/pages/AdminDispatchPage'));
const AdminZonesPage = lazy(() => import('@/features/admin/pages/AdminZonesPage'));
const AdminMetricsPage = lazy(() => import('@/features/admin/pages/AdminMetricsPage'));

function Lazy({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<RouteSkeleton />}>{children}</Suspense>;
}

function GuardAuth({ children }: { children: React.ReactNode }) {
  const { ready, authenticated } = useRequireAuth();
  if (!ready) return <LoadingScreen />;
  if (!authenticated) return null;
  return <>{children}</>;
}

function GuardAdmin({ children }: { children: React.ReactNode }) {
  const { ready, isAdmin } = useRequireAdmin();
  if (!ready) return <LoadingScreen />;
  if (!isAdmin) return null;
  return <>{children}</>;
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
        element: <GuardAdmin><Lazy><AdminLayout /></Lazy></GuardAdmin>,
        children: [
          { index: true, element: <Navigate to="/admin/pagos" replace /> },
          { path: 'productos', element: <Lazy><AdminProductsPage /></Lazy> },
          { path: 'pagos', element: <Lazy><AdminPaymentsPage /></Lazy> },
          { path: 'despacho', element: <Lazy><AdminDispatchPage /></Lazy> },
          { path: 'zonas', element: <Lazy><AdminZonesPage /></Lazy> },
          { path: 'metricas', element: <Lazy><AdminMetricsPage /></Lazy> },
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
