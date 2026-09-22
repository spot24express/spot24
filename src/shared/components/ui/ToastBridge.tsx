import { useEffect } from 'react';
import { useSnackbar } from 'notistack';
import { registerToaster } from '@/shared/lib/toast';

/** Montar dentro de <SnackbarProvider>: registra el enqueuer global. */
export function ToastBridge(): null {
  const { enqueueSnackbar } = useSnackbar();
  useEffect(() => {
    registerToaster(enqueueSnackbar);
  }, [enqueueSnackbar]);
  return null;
}
