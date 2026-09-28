/**
 * Providers globales: TanStack Query, notistack, observador de sesión
 * (con hidratación del carrito) y App Check.
 */
import { useEffect, useMemo, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SnackbarProvider } from 'notistack';
import { ToastBridge } from '@/shared/components/ui/ToastBridge';
import { useAuthObserver } from '@/features/auth/hooks/useAuth';
import { initAppCheck } from '@/shared/lib/appCheck';
import { logger } from '@/shared/lib/logger';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // staleTime por tipo de dato (7.2)
      gcTime: 30 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function SessionBootstrap() {
  useAuthObserver();

  // App Check obligatorio (6.2): se registra al arrancar (no-op sin llaves).
  useEffect(() => {
    void initAppCheck().catch((e) => logger.error('App Check no iniciado', e));
  }, []);

  return null;
}

export function AppProviders({ children }: { children: ReactNode }) {
  const notistackProps = useMemo(
    () => ({
      maxSnack: 3,
      autoHideDuration: 3200,
      anchorOrigin: { vertical: 'top' as const, horizontal: 'center' as const },
      style: { fontFamily: 'Barlow, sans-serif', fontWeight: 600 },
    }),
    [],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <SnackbarProvider {...notistackProps}>
        <ToastBridge />
        <SessionBootstrap />
        {children}
      </SnackbarProvider>
    </QueryClientProvider>
  );
}