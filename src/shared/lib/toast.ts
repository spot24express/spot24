/**
 * SPOT 24 · Puente de toasts: notistack v3 no expone `toast` global,
 * así que el SnackbarProvider registra su enqueuer aquí y toda la app
 * usa la API simple toast.success/error/info.
 */
import type { OptionsObject, SnackbarKey } from 'notistack';

type Enqueuer = (message: string, options?: OptionsObject) => SnackbarKey;

let enqueue: Enqueuer | null = null;

export function registerToaster(fn: Enqueuer): void {
  enqueue = fn;
}

function show(message: string, variant: 'success' | 'error' | 'info' | 'warning'): void {
  if (!enqueue) return;
  enqueue(message, { variant });
}

export const toast = {
  success: (m: string) => show(m, 'success'),
  error: (m: string) => show(m, 'error'),
  info: (m: string) => show(m, 'info'),
  warning: (m: string) => show(m, 'warning'),
};
