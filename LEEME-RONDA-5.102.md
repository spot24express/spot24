# RONDA 5.102 · El panel muestra TODOS los productos (los MOOG ya salen para editar)

## Tu reporte de hoy

> «En productos, los que dicen MOOG en el nombre no me aparecen para editarlos.
> Revisa muy bien que me salgan todos los productos.»

**Verificado en producción (solo lectura): tus ediciones de ayer SÍ quedaron
guardadas** — ~50 de los 78 repuestos MOOG ya tienen la marca MOOG y el nombre
sin el prefijo. Lo que fallaba era el LISTADO del panel, no tus guardados.

## El problema, en cristiano

- Admin → Productos leía de Firestore **solo los primeros 300 productos**
  (tope puesto en la ronda 5.95, cuando el catálogo era pequeño).
- Ya tienes **789 productos** (importaste los 7 PDF corregidos: 237 nuevos).
- Con el recorte, casi la mitad del catálogo quedaba FUERA del panel y de su
  buscador: por eso los MOOG «no aparecían» para editarlos. El contador que
  ves arriba del buscador («789 productos en total») siempre dijo la verdad —
  la lista era la que se quedaba corta.

## Qué cambia (3 archivos tocados + 2 nuevos)

1. **La lista se lee COMPLETA**: el panel recorre la colección entera por
   páginas de 300 con cursor, hasta agotarla. Tope de seguridad 3.000 (con el
   crecimiento actual, sobra). Todos los productos salen: MOOG incluidos,
   activos e inactivos.
2. **La búsqueda filtra en LOCAL**: antes cada tecla de la búsqueda re-leía
   Firestore (300 lecturas por letra). Ahora la lista completa se lee una vez
   (al abrir el panel o tras guardar/borrar/importar) y el texto busca sobre
   esa lista — más rápido y sin gastar lecturas por tecla.
3. **Orden estable**: los más recientes primero y, dentro de una misma
   importación, orden alfabético (antes el desempate era el orden interno de
   Firestore, que salía mezclado).
4. **Contador honesto**: si algún día se alcanzara el tope de seguridad, el
   contador mostraría «M en lista de N» en vez de esconder el recorte.

## Probado antes de entregar

- Typecheck ×3, lint 0 errores, pruebas raíz **201/201** (8 nuevas para el
  orden y el filtro del panel), funciones **46/14 omitidas**, reglas **21/21**
  con emulador de Firestore.
- Build de producción: **precache 115** (igual que la ronda anterior, sin
  sorpresas).

## Despliegue — pasos

1. **Sube el proyecto a Netlify** (push a GitHub como siempre). Los archivos
   que cambian en esta ronda:

   | # | Archivo | Acción |
   |---|---------|--------|
   | 1 | `src/features/admin/services/admin.service.ts` | ACTUALIZA |
   | 2 | `src/features/admin/pages/AdminProductsPage.tsx` | ACTUALIZA |
   | 3 | `src/features/admin/lib/listaAdmin.ts` | NUEVO |
   | 4 | `src/tests/admin-lista.test.ts` | NUEVO |
   | 5 | (referencia) `LEEME-RONDA-5.102.md` | este archivo |

2. **Abre el panel con la app recargada** (Ctrl+F5 en PC; en el teléfono,
   desliza la PWA fuera de las recientes y vuelve a entrar, para que el service
   worker nuevo tome el control).

3. **Comprueba**: Admin → Productos → busca «moog» → deben salir los 78
   (dice «78 encontrados de 789»). Edita los 27 que faltan: marca `MOOG` y
   quita el `MOOG ` del inicio del nombre. Al guardar, la lista se recarga
   completa.

## Notas técnicas (por si las necesitas)

- El coste de lecturas del panel sube de 300 a 1 por producto (789 hoy) POR
  CARGA del panel — se compensa porque la búsqueda ya no re-lee nada por
  tecla (antes: hasta decenas de cargas por sesión de edición).
- El cursor de paginación usa el orden interno de la colección (sin orderBy):
  no exige índices nuevos y evita de nuevo el problema 5.95 de mezclar
  Timestamp y número en createdAt.
- El Home y «Recién llegados» NO cambian en esta ronda (sigue la propuesta
  pendiente de ampliar la vitrina de 24 → 48 recientes, a tu decisión).
- Si al editar cualquiera de los 237 productos nuevos (los de los 7 PDF) te
  sale «Algo salió fuera de línea», revisa que las reglas 5.99 quedaron
  realmente PUBLICADAS (marca opcional) — dijiste que ya las publicaste, así
  que no debería aparecer.
