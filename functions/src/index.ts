/**
 * SPOT 24 · Índice de Cloud Functions.
 * Todos los callables exigen App Check (consumeAppCheckToken) y autenticación
 * salvo getBcvRate (lectura pública). Rate limiting en los públicos (6.4).
 */
export { fnReserveStock, fnQuoteTotals, fnCreateOrder, fnCancelOrder } from './orders';
export { fnVerifyPayment } from './payments';
export { fnUpdateOrderStatus } from './dispatch';
export { fnAdjustStock } from './catalog';
export { fnSetUserRole, fnRevokeUserSessions, fnGetAdminMetrics } from './admin';
export { updateBcvRate, fnGetBcvRate } from './rates';
