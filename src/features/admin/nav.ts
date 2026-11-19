/**
 * SPOT 24 · Navegación del panel (Pit stop central): datos PUROS, sin React,
 * para que un test pueda verificar el orden y los roles sin montar DOM.
 *
 * 5.155 · El dueño reportó que «11 Actualizar inventario» quedó entre 02 y 03
 * (se insertó después de Despacho en la ronda 5.153). La cápsula lleva número
 * propio (01…11), así que ahora se ordena POR NÚMERO: al final, tras 10 Copias.
 * Cada rol solo ve sus cápsulas (el guard por ruta vive en router.tsx).
 */
export interface AdminNavItem {
  to: string;
  label: string;
  code: string;
  roles: readonly string[];
}

export const NAV: ReadonlyArray<AdminNavItem> = [
  { to: '/admin/pagos', label: 'Pagos', code: '01', roles: ['admin', 'gerente', 'cajero'] },
  { to: '/admin/despacho', label: 'Despacho', code: '02', roles: ['admin', 'gerente', 'cajero', 'delivery'] },
  { to: '/admin/productos', label: 'Productos', code: '03', roles: ['admin', 'gerente'] },
  { to: '/admin/categorias', label: 'Categorías', code: '04', roles: ['admin', 'gerente'] },
  { to: '/admin/zonas', label: 'Zonas', code: '05', roles: ['admin', 'gerente'] },
  { to: '/admin/usuarios', label: 'Usuarios', code: '06', roles: ['admin', 'gerente'] },
  { to: '/admin/metricas', label: 'Métricas', code: '07', roles: ['admin', 'gerente'] },
  { to: '/admin/promos', label: 'Promos', code: '08', roles: ['admin', 'gerente'] },
  { to: '/admin/ajustes', label: 'Ajustes', code: '09', roles: ['admin'] },
  { to: '/admin/copias', label: 'Copias', code: '10', roles: ['admin'] },
  /* 5.153 · Actualizar inventario: la ÚNICA vía de importación (el dueño ya no
     quiere PDFs); cajero, gerente y admin (decisión del dueño). */
  { to: '/admin/inventario', label: 'Actualizar inventario', code: '11', roles: ['admin', 'gerente', 'cajero'] },
];

/**
 * 5.155 · Roles que ven la tarjeta compacta «Tasa vigente» en la cabecera del
 * panel (pedido del dueño). Delivery queda fuera: no cobra ni convierte Bs/USD.
 * La tarjeta completa (vigía del cron + «Leer BCV ahora») sigue SOLO en
 * Métricas (admin y gerente).
 */
export const VER_TASA: ReadonlyArray<string> = ['admin', 'gerente', 'cajero'];
