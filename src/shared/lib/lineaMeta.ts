/**
 * Helper puro para armar líneas secundarias de texto (5.112-A).
 * Une las partes con « · » descartando las vacías (false/null/undefined/''),
 * así ninguna vista queda con separadores colgantes ni dobles puntos.
 *
 * DECISIÓN DEL DUEÑO (5.112-A): el `code` del producto es un dato interno —
 * se muestra SOLO en vistas del personal (verificación de pagos y despacho);
 * el CLIENTE JAMÁS lo ve. Órdenes viejas sin código: la parte `l.code && ...`
 * cae como false y la línea queda igual que antes.
 */
export function unirConPuntos(...partes: Array<string | false | null | undefined>): string {
  return partes
    .filter((p): p is string => typeof p === 'string' && p.trim() !== '')
    .join(' · ');
}
