/**
 * SPOT 24 · Analítica sin datos personales (sección 8.4)
 * Eventos: view_item, add_to_cart, begin_checkout, purchase.
 * Nunca se envían teléfonos, direcciones, referencias ni identificadores
 * distintos de los IDs internos de producto/orden.
 */

type AnalyticsEvent =
  | { name: 'view_item'; params: { itemId: string; itemCategory: string; valueUsd?: number } }
  | { name: 'add_to_cart'; params: { itemId: string; itemCategory: string; quantity: number } }
  | { name: 'begin_checkout'; params: { valueUsd: number; items: number } }
  | { name: 'purchase'; params: { orderId: string; valueUsd: number; items: number; method: string } };

let analyticsPromise: Promise<null | import('firebase/analytics').Analytics> | null = null;

async function getAnalytics(): Promise<null | import('firebase/analytics').Analytics> {
  if (import.meta.env.VITE_ANALYTICS_ENABLED !== 'true') return null;
  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      const { loadFirebase } = await import('./firebase');
      const fb = await loadFirebase();
      if (!fb) return null;
      const { getAnalytics, isSupported } = await import('firebase/analytics');
      if (!(await isSupported())) return null;
      return getAnalytics(fb.app);
    })();
  }
  return analyticsPromise;
}

export async function trackEvent(event: AnalyticsEvent): Promise<void> {
  try {
    const ga = await getAnalytics();
    if (!ga) return;
    const { logEvent } = await import('firebase/analytics');
    const { name, params } = event;
    switch (name) {
      case 'view_item':
        logEvent(ga, 'view_item', {
          items: [{ item_id: params.itemId, item_category: params.itemCategory }],
          value: params.valueUsd,
          currency: 'USD',
        });
        break;
      case 'add_to_cart':
        logEvent(ga, 'add_to_cart', {
          items: [{ item_id: params.itemId, item_category: params.itemCategory }],
          quantity: params.quantity,
        });
        break;
      case 'begin_checkout':
        logEvent(ga, 'begin_checkout', { value: params.valueUsd, currency: 'USD', num_items: params.items });
        break;
      case 'purchase':
        logEvent(ga, 'purchase', {
          transaction_id: params.orderId,
          value: params.valueUsd,
          currency: 'USD',
          num_items: params.items,
          payment_method: params.method,
        });
        break;
    }
  } catch {
    // La analítica nunca rompe la experiencia ni registra el error en la UI.
  }
}
