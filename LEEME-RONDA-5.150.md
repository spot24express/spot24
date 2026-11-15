# LEEME · Ronda 5.150 — «EL BORRADO DEL PANEL NUNCA SE CONECTÓ» + diagnóstico del catálogo

**Base:** `356668c` (5.145–5.148) **+ Ronda 5.149** (fix de «Recién llegados»/«Cargar más» aplicada en el mismo paquete). Sin colecciones, índices ni reglas nuevas.
**Qué resuelve:** dos cosas reportadas el 15/11:
1. Al borrar un producto desde el panel: **«Algo salió fuera de línea. Para. Resuelve. Sigue: reintenta en unos segundos.»**
2. Falta una forma de VER qué se sumó con el importador y cómo está el catálogo ahora mismo («¿puedes meterte y observar?»).

---

## 1 · El bug del borrado (causa raíz encontrada)

La 5.124 construyó el core Admin SDK `fn-deleteProduct` (rol admin/gerente verificado EN EL SERVIDOR, blindaje de reservas activas, idempotente, auditoría) **pero el panel nunca dejó de usar el borrado por CLIENTE**:

- `admin.service.ts · adminDeleteProduct` seguía haciendo `writeBatch` cliente sobre `variants` + ficha.
- Las reglas lo niegan SIEMPRE: en un DELETE `request.resource.data` NO existe, la condición de `/variants` da falso, el lote entero aborta con `permission-denied` (exactamente la causa que motivó la 5.124 — se arregló el servidor y se olvidó reconectar el cliente).
- El panel captura el error crudo y muestra el genérico «Algo salió fuera de línea» (`errors.ts · generic`).

**La cura (2 archivos + 1 guardián):**

| Archivo | Cambio |
|---|---|
| `src/features/admin/services/admin.service.ts` **(MODIFICADO)** | `adminDeleteProduct` ahora llama a `callFunction('fn-deleteProduct', { productId })`. El servidor verifica el rol, rechaza con mensaje accionable si el producto tiene carritos en checkout (reserva activa), borra variantes + ficha atómico y audita. |
| `netlify.toml` **(MODIFICADO)** | `[functions."fn-deleteProduct"] timeout = 26` — era la ÚNICA función sin entrada propia: moría con el tope de fábrica de 10 s con la red degradada (mismo motivo de `fn-deleteUser`). |
| `src/tests/borrado-servidor-5150.test.ts` **(NUEVO)** | GUARDIÁN (6 tests, estático, sin Firebase): el panel va por `fn-deleteProduct`, el `writeBatch` cliente NO vuelve a esa función, el core conserva rol + blindaje, y el timeout de 26 s está en `netlify.toml`. Si un paste futuro revierte cualquiera de las 4, la suite se rompe y dice qué archivo reponer. |

Después del deploy: borrar desde Admin → Productos funciona para **admin Y gerente**; si el artículo tiene carritos en checkout, el mensaje es la verdad («Espera unos minutos o pide al cliente terminar o cancelar»).

---

## 2 · Observar el catálogo desde tu terminal (SOLO LECTURA)

**`functions/scripts/diagnostico-catalogo.mjs` (NUEVO)** — no tiene modo de escritura: jamás toca nada. Responde con datos reales de TU base:

- **Qué se sumó con el importador**: huella (inactivo + sin categoría + precio 0) con códigos/fechas/nombres, y los **registros de auditoría de cada importación** (cuándo corrió cada una y cuántas filas trajo).
- **Los TIPOS de fecha de tu catálogo**: cuántos `createdAt` son Timestamp vs número. Firestore ordena Timestamps por ENCIMA de los números: si tus productos viejos tienen fecha-Timestamp, van PRIMERO aunque la fecha sea vieja — y las altas envejecidas a 2020 quedan DEBAJO de todos.
- **La cabeza del catálogo tal cual la ve la tienda** (primeros 30 del orden, con tipo/activo/categoría/precio/código).
- **Simulación de «Recién llegados»**: activos dentro de las primeras 72 docs (código actual) y el top-8 que mostraría con la 5.149 desplegada.
- **Bloqueadores de cabeza**: inactivos con fecha-Timestamp que la huella del script de envejecer NO cubrió (p. ej. altas a medio completar desde el panel: les diste categoría o precio pero siguen inactivas).

**Uso (PowerShell, terminal propia — NO en la de netlify dev):**

```bash
node functions\scripts\diagnostico-catalogo.mjs
```

Al final imprime un bloque **«RESUMEN PARA EL ASISTENTE»** (JSON): cópialo tal cual y pégalo en el chat — con esos números se decide la cura exacta del «1 solo producto» sin tocar nada.

**Sobre tu `purgar-altas-import.mjs`:** el script está bien escrito (simulación por defecto, respaldo implícito por conservar, protección por ventas, lotes ≤450). Dos notas:
1. Si lo corriste con `--envejecer --aplicar`, las altas ya están hundidas a 2020 como NÚMERO — pero si tus productos viejos conservan fecha-Timestamp, ellos siguen arriba y «Recién llegados» sigue tapado (el diagnóstico lo mide con exactitud).
2. Las altas que completaste a medias desde el panel (categoría o precio, pero sin activar) ya NO cumplen la huella: quedaron arriba y no las envejeció. El diagnóstico las lista como «bloqueadores».

---

## 2b · Lo que dijo TU diagnóstico del 15/11 (leído y decidido)

Corriste `diagnostico-catalogo.mjs` y estos son los números de TU base:

```
productos: 1030 · activos: 529 · inactivos: 501
createdAtTimestamp: 0        ← bien: TODOS los createdAt son número (sin bloqueadores de tipo)
huellaTotal: 55 · envejecidas: 55 · frescas: 0   ← tu purgar-altas-import.mjs SÍ hizo su trabajo
activosEnPrimeras72: 0       ← «Recién llegados» vacío hoy: los 72 primeros docs son inactivos
bloqueadoresInactivosTimestamp: 0
```

**La historia completa, sin tecnicismos:**

1. La importación del 15/11 (02:30 a. m.) creó ~500 borradores: inactivos, sin categoría. Tu script los envejeció SOLO a los 55 que tenían precio 0 (su huella exige `precio == 0`).
2. La pasada «solo precios» les cargó precio ENCIMA a la mayoría (~446): al tener precio, ya no cumplen la huella estricta de tu script → quedaron frescos arriba → siguen tapando la cabeza del catálogo (así se ve en la CABEZA: los primeros 30 son TODOS inactivos con precio y fecha 15/11).
3. Con el código de hoy en producción (sin deploy), la tienda lee 12 a la vez y descarta inactivos DESPUÉS de leer: hay que darle «Cargar más» unas 40 veces para atravesar ~500 borradores. Y «Recién llegados» escanea 72 y encuentra 0 activos → vacía (el «1 producto» que viste fue lo último que quedó a su alcance).
4. **Con la 5.149 desplegada la tienda pide SOLO activos**: los borradores dejan de leerse aunque existan. Simulación con tus datos: «Recién llegados» muestra CHUPETA + HELADO TRISABOR + MAGNUM × 5 + SANDWICH (todo real, activo, con fecha del 10/11). «Ver todo» muestra productos reales desde la primera página.
5. El error al borrar era otra cosa: el panel hacía el borrado por CLIENTE (reglas lo niegan siempre) en vez de llamar a `fn-deleteProduct` — corregido en esta ronda (sección 1).

**Curas (las dos):**

| Cura | Qué arregla | Cómo |
|---|---|---|
| **Deploy** (push → Netlify) | Recién llegados + Cargar más + botón borrar | El código ya está listo en esta copia: 5.149 (consulta solo activos) + 5.150 (borrado por servidor). LA DATA SOLA NO REEMPLAZA EL CÓDIGO. |
| **`limpiar-borradores-import.mjs`** (NUEVO) | Saca los ~446 borradores con precio que tu script no cubrió | Huella AMPLIA: inactivo + sin categoría, CUALQUIER precio. Respeta los que tienen categoría y los que tienen ventas. |

**`functions/scripts/limpiar-borradores-import.mjs` (NUEVO)** — mismo patrón que tus herramientas (simulación por defecto, respaldo JSON antes de aplicar, lotes ≤ 450, jamás toca activos ni con ventas ni con categoría):

```bash
# 1) VER qué haría (no toca nada):
node functions\scripts\limpiar-borradores-import.mjs

# 2) Si lo que ves te cuadra — conservar fichas y hundirlas a 01/01/2020 12:00:
node functions\scripts\limpiar-borradores-import.mjs --envejecer --aplicar

#    …o borrarlas definitivamente (guarda respaldo con fichas + variantes):
node functions\scripts\limpiar-borradores-import.mjs --borrar --todo --aplicar
```

Con la tienda ya desplegada, este paso es COSMÉTICO (limpia la lista del Admin y evita data muerta); sin deploy, NO arregla la tienda por sí solo. **El orden correcto es: deploy primero, limpieza después.**

Nota menor: el diagnóstico no pudo leer el historial de importaciones porque falta un índice de `auditLog` (`action + at`) — ya está declarado en `firestore.indexes.json`; se crea solo cuando despliegues índices (`firebase deploy --only firestore:indexes`) o en tu próximo deploy de Firestore. No afecta a la tienda.

Los borradores CON categoría (p. ej. «NESCAFE BORRAR», con categoría pero inactivo) NO los toca el script a propósito: se completan o borran a mano desde Admin → Productos (y de paso pruebas el botón de borrar arreglado).

## 3 · Verificación (ejecutada)

```bash
npm run typecheck   # ✔ limpio
npm test            # ✔ 36 archivos · 470/470 (464 previas + 6 guardianes nuevos)
node --check functions/scripts/diagnostico-catalogo.mjs       # ✔ sintaxis
node --check functions/scripts/limpiar-borradores-import.mjs  # ✔ sintaxis
```

(`lint` y `build:only` se ejecutaron en la pasada original de la ronda, sin errores en los archivos tocados; esta ampliación solo añade dos scripts `.mjs` sin TS nuevo.)

Suite `functions/` intacta (esta ronda no toca `functions/src/` — el core `fn-deleteProduct` de la 5.124 ya estaba completo y probado).

---

## 4 · Checklist en producción

1. **Pre-vuelo del índice (SOLO LECTURA, ~10 s)** — el ÚNICO riesgo real de esta ronda: la 5.149 exige que el índice compuesto `products (active + createdAt desc)` y el de categoría (`categoryId + active + createdAt desc`) EXISTAN en el proyecto. El JSON los declara, pero se verifica en vivo:
   `node functions\scripts\verificar-indice-activos.mjs`
   → «✔ TODO OK» = puedes hacer push con tranquilidad.
   → enlace de creación = clic, esperar «Enabled» (~1-2 min con 1030 docs), repetir el script hasta TODO OK. El índice se puede crear ANTES del código: no afecta a la tienda actual.
2. **Deploy web** (push → Netlify): el borrado del panel pasa al servidor y «Recién llegados»/«Cargar más» recuperan el fix 5.149 (el fix vive en código, la cura de datos sola no lo reemplaza).
3. Probar en la tienda: Home «Recién llegados» con los helados/chupeta + «Ver todo» primera página con productos reales.
4. **Borrado del panel**: el fix ya viaja en este deploy; probar cuando el dueño decida (p. ej. «NESCAFE BORRAR») → toast «Producto eliminado».
5. **Limpieza de borradores**: DECISIÓN DEL DUEÑO (15/11): NO correr — se conservan todos los productos. El script queda listo (siempre simula primero).
6. Opcional de índices: `firebase deploy --only firestore:indexes` para crear también el índice de `auditLog` (solo afecta al historial del diagnóstico, no a la tienda).
