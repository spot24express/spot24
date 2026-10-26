/**
 * SPOT 24 · 5.98 (punto C) · «Los más pedidos» — suma de unidades entregadas.
 * Libra PURA (sin Firebase): la usa la transacción de coreUpdateOrderStatus
 * (dispatch.ts) para incrementar vendidosTotal al marcar un pedido Entregado.
 * · Líneas únicas por productId (2 variantes del mismo producto suman ambas).
 * · qty saneada: entero (floor), solo > 0, tope defensivo 1000 por línea.
 * · Ignora líneas rotas sin romper la entrega.
 * «entregado» es terminal en la máquina de estados → corre 1 vez por pedido.
 */
export function qtyVendidosPorProducto(lines: unknown): Map<string, number> {
  const porProducto = new Map<string, number>();
  for (const l of Array.isArray(lines) ? (lines as Array<Record<string, unknown>>) : []) {
    const pid = String(l?.['productId'] ?? '');
    const qty = Math.floor(Number(l?.['qty'] ?? 0));
    if (!pid || !Number.isFinite(qty) || qty <= 0) continue;
    porProducto.set(pid, (porProducto.get(pid) ?? 0) + Math.min(qty, 1000));
  }
  return porProducto;
}
