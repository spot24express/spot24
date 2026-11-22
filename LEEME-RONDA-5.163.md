# RONDA 5.163 · Usuarios por grupos con conteos + filtro Todos/Activos/Inactivos en Productos

**Motivo:** dos pedidos del dueño para el panel admin:

1. En «Usuarios», ver el **PERSONAL** y los **CLIENTES** separados, cada grupo con su número.
2. En «Productos», un filtro **Todos / Activos / Inactivos**.

Estos dos cambios suben **JUNTOS con la 5.162** (CSP de las hospederías de respaldo) en
**UN solo push = UN deploy = 15 créditos**. La 5.162 sigue siendo exactamente la que ya
tenías aplicada: no se toca.

## Qué cambia (7 archivos, solo el panel admin — la tienda no se toca)

1. `src/features/admin/lib/usuariosGrupos.ts` — **NUEVO**. La separación pura:
   `esPersonal` (todo rol distinto de `customer` es personal) y `separarUsuarios`
   (parte la lista en `{ personal, clientes }` sin mutar; la suma de ambos grupos
   SIEMPRE es el total).
2. `src/features/admin/pages/AdminUsersPage.tsx` — la lista única pasa a **dos
   secciones**: «Personal» (cajeros, deliverys, gerentes y admins) y «Clientes»,
   cada una con su **conteo** en el título (`3 personas` / `42 clientes`). Con la
   búsqueda activa que recorta un grupo, el título muestra `visibles de total`
   (mismo patrón que el «M encontrados de N» de Productos). La ficha de cada
   persona es EXACTAMENTE la de siempre (selector de rol, «Cerrar sesiones»,
   «Eliminar») — se extrajo a `UsuarioRow` para no duplicarla; sus reglas no
   cambian: el gerente sigue en solo lectura y nadie puede eliminarse a sí mismo
   ni a otro admin. La búsqueda sigue buscando en ambos grupos a la vez.
3. `src/features/admin/lib/listaAdmin.ts` — + `FiltroEstado`, `filtrarEstadoProductosAdmin`
   y `contarPorEstado` (puros, sin Firestore, combinables con la búsqueda).
4. `src/features/admin/pages/AdminProductsPage.tsx` — **tres chips** sobre la lista:
   `Todos · N` / `Activos · M` / `Inactivos · K` (los conteos viven en los propios
   botones, así ves cuántos inactivos hay sin tocar nada). Un toque filtra; el
   contador de la línea superior respeta el filtro (`7 inactivos de 789`) y la
   búsqueda convive con el filtro. Además, por primera vez la lista tiene mensaje
   de vacío («Ningún producto coincide con esa búsqueda», «No hay productos
   inactivos…») en vez de quedarse en blanco.
5. `src/tests/usuarios-grupos-5163.test.ts` — **NUEVO** (8 tests): la separación,
   los conteos y la inmutabilidad.
6. `src/tests/productos-filtro-estado-5163.test.ts` — **NUEVO** (10 tests): los tres
   estados, la combinación con la búsqueda y los conteos.
7. `LEEME-RONDA-5.163.md` — este archivo.

**Lo que NO cambia:** reglas de seguridad del backend (cambios de rol y bajas siguen
siendo exclusivos del admin por funciones de servidor), la tienda pública (el catálogo
de los clientes ya mostraba solo activos desde la 5.151 — este filtro es SOLO del
panel), firebase, el SW ni la CSP de la 5.162.

## Números verificados en esta ronda

| Métrica | Antes | Después |
|---|---|---|
| Tests raíz | 462 (40 archivos) | **480 en verde (42 archivos)** |
| Tests functions | 218 + 18 saltados (236) | sin cambios |
| Build | typecheck + vite + precache 103 | sin cambios (SW idéntico en entradas) |

## Cómo aplicar (VSC, Windows)

1. Extraer `spot24-ronda-5.163.zip` sobre `C:\Users\Erick\spot24` (7 archivos).
2. Verificación local:
   ```bash
   npm test     # raíz: 480 tests (42 archivos)
   ```
   (functions no cambia; el build da lo de siempre.)
3. **Commit y push COMBINADO (5.162 + 5.163 — 1 deploy = 15 créditos):**
   ```bash
   git add netlify.toml src/tests/csp-runtime-hosts-5162.test.ts LEEME-RONDA-5.162.md src/features/admin/lib/usuariosGrupos.ts src/features/admin/lib/listaAdmin.ts src/features/admin/pages/AdminUsersPage.tsx src/features/admin/pages/AdminProductsPage.tsx src/tests/usuarios-grupos-5163.test.ts src/tests/productos-filtro-estado-5163.test.ts LEEME-RONDA-5.163.md
   git commit -m "5.162+5.163: CSP conect-src hospederias del SW + guardian; Usuarios por grupos con conteos; filtro Todos-Activos-Inactivos en Productos"
   git push
   ```
   (Si prefieres verificar primero: `git status` debe mostrar exactamente 4 archivos
   modificados y 6 nuevos — nada más.)

## Verificación en producción tras el Published

1. **Admin → Usuarios:** dos bloques — «Personal» con su número y «Clientes» con el
   suyo. La búsqueda sigue funcionando sobre ambos; mientras recorta un grupo, el
   título de ese grupo dice `X de Y`.
2. **Admin → Productos:** tres chips con conteos. Tocar «Inactivos» muestra SOLO los
   inactivos; «Activos» lo mismo; «Todos» vuelve a la lista completa. Con búsqueda
   activa, se aplican ambas cosas (ej.: búsqueda «moog» + «Inactivos» = los MOOG
   inactivos).
3. **(5.162) Fotos de iili.io:** abren sin «violates connect-src» ni `ERR_FAILED`;
   segunda carga desde el cache del SW.
4. El SW reinstala el precache UNA vez tras el deploy (el ruido de siempre, 30-60 s
   hasta «activated and running»).
5. Si algo se viera raro: **Rollback = 0 créditos** (en Netlify, «Deploy detail →
   Publish deploy» sobre el anterior).

## Estado del día de los 300 créditos

- Deploy 5.160+5.161: publicado y confirmado (reapertura instantánea, modo avión OK).
- Este push combinado 5.162+5.163: 15 créditos → gastados 30 del día, **quedan ~270**.
- El litmus pendiente no cambia: pedido punta a punta, ensayo con el Excel del ERP,
  corrida real del turno, «Crear copia ahora», export PDF del panel.
