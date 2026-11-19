# LEEME · Ronda 5.155 · «11» en su lugar + Tasa vigente para admin, gerente y cajero

Fecha: 18/11/2026 (noche, Caracas) · Base: ronda 5.151-5.153 (probada con `netlify dev`) · Estado: **listo para pegar en VSC, testear y desplegar**

Dos pedidos del dueño, implementados tal cual:

1. **«11 Actualizar inventario» quedó en el lugar correcto.** En tu captura se veía metido **entre
   02 Despacho y 03 Productos**: así lo insertó la ronda 5.153 en el arreglo del menú. Como la cápsula
   lleva número propio (01…11), ahora el panel **se lee en orden numérico**: `01 Pagos · 02 Despacho ·
   03 Productos · 04 Categorías · 05 Zonas · 06 Usuarios · 07 Métricas · 08 Promos · 09 Ajustes ·
   10 Copias · 11 Actualizar inventario`. Cada rol sigue viendo solo sus cápsulas (cajero: 01, 02 y 11).
2. **La tasa vigente la ven admin, gerente Y cajero.** Antes solo vivía dentro de Métricas (07) — y el
   cajero no entra a esa sección, así que cobraba sin ver la tasa. Ahora hay una **tarjeta compacta
   «Tasa vigente (Bs por USD)»** en la cabecera del panel, visible para los tres roles en **TODAS** las
   secciones (Pagos, Despacho, Actualizar inventario…). Muestra exactamente lo que pediste:
   `Tasa vigente (Bs por USD)` → `916,65` → `Fecha valor: Miércoles, 18 de noviembre de 2026`.
   Delivery queda fuera (no cobra ni convierte Bs/USD). La tarjeta COMPLETA de Métricas (vigía del cron,
   «Leer BCV ahora», tasa pendiente) no cambia: sigue para admin y gerente.

---

## 1 · Cómo funciona la tarjeta de la cabecera

- Lee el **mismo documento `rates/bcv`** por el hook compartido `useBcvRate` (patrón vigía del proyecto:
  UNA sola conexión Firestore para toda la app). Cuando el cron horario o «Leer BCV ahora» escriben, la
  tarjeta **se repinta sola**, sin recargar.
- Se agregó `fechaValor` al hook (antes no lo exponía). Es aditivo: carrito, checkout y tarjetas de
  producto no cambian. Detalle fino: si el BCV publica la **misma tasa para un día nuevo**, ahora la
  fecha valor se refresca igual (antes solo se movía si cambiaba la cifra).
- Mientras llega la tasa muestra `—` (milisegundos: queda en cache).
- Los formateadores (`rateText` → `916,65` · `fmtFechaValor` → `Miércoles, 18 de noviembre de 2026`)
  salieron de AdminMetricsPage hacia `shared/lib/format.ts` y ahora los usan la tarjeta compacta y la
  grande. Mismos textos, cero duplicación.

## 2 · Archivos de la ronda (lo único que cambia)

NUEVOS (3):
- `src/features/admin/nav.ts` — el menú del panel como datos puros (NAV + VER_TASA), fuera del
  componente, para que un test vigile el orden 01→11 sin montar DOM.
- `src/features/admin/components/TasaVigenteCard.tsx` — la tarjeta compacta de la cabecera.
- `src/tests/panel-nav-tasa-5155.test.ts` — 12 tests: orden numérico de las cápsulas (la regresión
  exacta que reportaste), «11» última tras «10 Copias», orden por rol (admin/gerente/cajero/delivery),
  roles de inventario intactos (decisión 5.153), VER_TASA = admin+gerente+cajero, y los formatos con
  TUS ejemplos (`916,65` y `Miércoles, 18 de noviembre de 2026`).

MODIFICADOS (4):
- `src/features/admin/pages/AdminLayout.tsx` — NAV y VER_TASA ahora vienen de `../nav`; monta
  `<TasaVigenteCard />` a la derecha del título para los roles de VER_TASA. Nada más.
- `src/shared/hooks/useBcvRate.ts` — expone `fechaValor` y la incluye en la comparación de cambios
  (solo re-renderiza si cambia tasa, fuente o fecha valor; el toque horario del cron sigue sin
  provocar renders).
- `src/shared/lib/format.ts` — recibe `rateText` y `fmtFechaValor` (compartidas, misma lógica).
- `src/features/admin/pages/AdminMetricsPage.tsx` — importa los formateadores compartidos y ya no
  tiene copias locales. Pantalla idéntica a la que conoces.

**Sin cambios en functions, Firestore, reglas, dependencias ni configuración de Netlify.**
La ronda 5.154 (borrar el código PDF dormido) sigue pendiente tal como quedó acordado: espera tu
confirmación de que el Excel corre bien en producción.

## 3 · Para probarla tú (2 minutos)

1. Pega los 7 archivos en VSC y deja correr `netlify dev` (recarga sola).
2. Entra al panel: «11» debe quedar **al final**, después de «10 COPIAS», y arriba a la derecha la
   tarjeta **Tasa vigente** con la cifra y la fecha valor.
3. Cambia de rol si tienes usuarios cajero/gerente: los tres deben ver la tarjeta; el cajero además
   ve sus cápsulas `01 · 02 · 11` en ese orden.
4. Prueba rápida del hook: entra a Métricas y pulsa «Leer BCV ahora» → al terminar, la tarjeta de la
   cabecera se refresca sola (misma conexión).

## 4 · Verificación corrida en desarrollo

- Frontend: **490 passed** (38 archivos) — los 478 previos + 12 nuevos de la ronda.
- `npm run build` (typecheck + vite): **OK** — PWA 1.3.0, 121 entradas en precache.
- Netlify build: no toca nada nuevo (mismos pasos que la ronda anterior; los dos `package.json` ya
  entraron en el commit de 5.151-5.153).

## 5 · Commit y despliegue

```bash
git add src/features/admin/nav.ts src/features/admin/components/TasaVigenteCard.tsx src/tests/panel-nav-tasa-5155.test.ts src/features/admin/pages/AdminLayout.tsx src/features/admin/pages/AdminMetricsPage.tsx src/shared/hooks/useBcvRate.ts src/shared/lib/format.ts
git commit -m "5.155: orden 01-11 en el panel + tasa vigente en la cabecera para admin/gerente/cajero"
git push
```

Solo redespliega el SITIO (Netlify): cero funciones, cero reglas, cero variables nuevas. Cuando
Netlify termine, refresca la PWA dos veces (service worker) y listo.
