# RONDA 5.105 · Exportar el inventario a PDF (completo o por categorías)

## Tu pedido de hoy

> «Quiero que en productos se pueda exportar un PDF que contenga el inventario
> de productos actuales con toda su información: nombre, marca, código,
> categoría/subcategoría, estado, precio, stock, descripción y enlace de foto.
> Y que pueda hacerlo completo y por categorías, ya sean todas o las que
> necesite.» (precio: solo USD · tabla limpia: una fila por producto · enlace
> clickeable · tamaño CARTA)

## Lo nuevo en el panel → Productos

- Botón nuevo **«Exportar PDF»** (al lado de «Importar PDF»).
- Al abrirlo eliges:
  - **Qué categorías** entran: árbol completo con casillas. Pulsar una
    categoría PRINCIPAL marca o desmarca su rama entera (subs incluidas);
    cada sub se puede marcar suelta. Atajos «Todas» / «Ninguna».
  - **Incluir también los inactivos** (por defecto SÍ): la tabla muestra el
    estado de cada producto con color (Activo verde / Inactivo rojo).
- Un resumen EN VIVO abajo te dice cuántos productos, stock total y valor del
  inventario en USD van a salir **antes** de generar: lo que ves es lo que sale.
- **«Generar PDF»** descarga `inventario-spot24-FECHA.pdf` (carta horizontal).

## El PDF, tal como lo pediste

- **Una fila por producto** (tabla limpia): Código · Nombre · Marca ·
  Categoría / Sub · Estado · Precio USD · Stock · Descripción completa ·
  **Foto (enlace clickeable)** — en el PDF, la celda de foto abre la imagen
  con un clic.
- Ordenado **por categoría** (el mismo orden de tu árbol del panel) y dentro
  de cada una por subcategoría y nombre A-Z. Al cierre de cada categoría, una
  fila **SUBTOTAL** con productos, stock y valor USD del grupo.
- **Encabezado de la primera página**: fecha y hora de generación, filtro de
  estado, categorías incluidas, total de productos, stock total y valor total.
- **Pie en todas las páginas**: «Página N de M».
- Las filas nunca se cortan entre páginas; las URLs de foto largas se muestran
  recortadas con «…» pero el ENLACE abre la foto completa.
- Enlaces relativos (`/img/products/...`) solo se ven como texto; los `https://…`
  abren directo con el clic.

## «¿Sale actualizado si algo cambia?»

**Sí.** El PDF se arma EN EL MOMENTO de presionar «Generar PDF» con la lista
que el panel acaba de leer de Firestore (se relee al abrir Productos y tras
cada guardar/borrar/importar). Si editas un precio y exportas de nuevo, sale
con el precio nuevo. Único cuidado: si tienes el panel abierto desde hace
horas sin recargar y cambiaste cosas desde OTRO dispositivo, recarga el panel
antes de exportar.

## Probado antes de entregar

- Typecheck raíz + netlify: limpio. Lint: 0 errores (10 warnings de siempre).
- Pruebas raíz **220/220** (207 de la 5.104 + **13 nuevas** del export:
  formato USD, nombre de archivo, recorte de URLs largas, árbol de selección,
  filtro por categorías, estado, orden de grupos, subtotales y un test que
  GENERA un PDF real).
- **Muestra real generada con tu producción** (solo lectura): 789 productos,
  25 categorías, 38 páginas, 5 subtotales, valor total $100,996.65 — el mismo
  código del lote, cero avisos de desborde (se corrigió el recorte de URLs
  largas detectado con esa muestra).
- **Columna Código a medida** (ajuste 5.105-A tras revisar la muestra contigo):
  los códigos reales llegan a 15 caracteres (COLCHONINFLAMED, CARIPHONE17PRO)
  — la columna se ensanchó a lo justo para que NINGÚN código se doble a dos
  líneas; se compensó con Marca y Descripción (las más vacías en tu tabla).
  Verificado además: los 789 productos tienen código en la base — no verás
  «—» en esa columna salvo que un producto nuevo se cree sin código.
- Build de producción: **precache 116** (mismo número que la 5.104) y el peso
  del precache BAJÓ. Motivo: jsPDF (la librería que fabrica el PDF, ~394 KB)
  vive en su propio archivo `jspdf-vendor-*.js` y **NO se precachea**: solo
  se descarga quien exporte. Sin esta separación, TODOS tus clientes habrían
  pagado ese peso al arrancar — en redes venezolanas, ni un KB de más.
- La tienda (lo que ve el cliente) no cambió NI UNA LÍNEA visual: esta ronda
  es solo del panel.

## Despliegue — pasos (OJO: esta ronda pide npm install)

1. **Pega el lote** sobre tu proyecto. Los archivos que cambian:

   | # | Archivo | Acción |
   |---|---------|--------|
   | 1 | `package.json` | ACTUALIZA (agrega jspdf + jspdf-autotable) |
   | 2 | `package-lock.json` | ACTUALIZA (obligatorio: fija versiones) |
   | 3 | `vite.config.ts` | ACTUALIZA (chunk propio de jsPDF, sin precache) |
   | 4 | `src/features/admin/pages/AdminProductsPage.tsx` | ACTUALIZA |
   | 5 | `src/features/admin/lib/exportarInventario.ts` | **NUEVO** (obligatorio) |
   | 6 | `src/tests/exportar-inventario.test.ts` | **NUEVO** (obligatorio) |
   | 7 | (referencia) `LEEME-RONDA-5.105.md` | este archivo |

2. **En tu PC, dentro de la carpeta del proyecto, ejecuta** `npm install`
   (una sola vez: instala jspdf para poder probar en local). **Netlify NO lo
   necesita** — al desplegar, él solo instala según `package-lock.json`.

3. **Sube el proyecto a Netlify** (push a GitHub como siempre).

4. **Recarga la PWA** (Ctrl+F5 en PC; en el teléfono, desliza la app fuera de
   las recientes y vuelve a entrar) y entra al panel → Productos.

5. **Comprueba**:
   - Botón «Exportar PDF» → se abre el diálogo con tu árbol de categorías.
   - «Generar PDF» con todo marcado → baja `inventario-spot24-FECHA.pdf`
     con tus 789 productos (~38 páginas), subtotales por categoría
     (Repuestos 507 · Varios 104 · Licores 40 · Lubricantes 7 · Alimentos y
     Bebidas 131) y enlaces de foto clickeables.
   - Prueba una exportación por categoría: desmarca todo, marca solo
     «Accesorios Importados» → el PDF sale solo con esa subcategoría.

## Notas técnicas (por si las necesitas)

- Sin backend: usa la lista completa que el panel ya carga (0 lecturas
  extra de Firestore).
- El resumen del diálogo usa EXACTAMENTE el mismo código que arma el PDF:
  imposible que lo que anuncia difiera de lo que baja.
- Productos sin código o sin marca salen con «—»; sin foto, con «—».
- «Sin categoría»: si un producto quedara apuntando a una categoría borrada,
  el PDF no lo pierde — sale al final con ese rótulo (no ha pasado en tu
  tienda: comprobado por lectura directa).
- En cola (tu decisión, nada ejecutado): el «carrusel por bahía principal»
  para «Recién llegados» (mostrar 2 de cada categoría principal, incluso de
  Licores/Lubricantes con stock viejo) y el cambio de subtítulo de la sección.
