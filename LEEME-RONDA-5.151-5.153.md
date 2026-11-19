# LEEME · Ronda 5.151 → 5.152 → 5.153 · «Actualizar inventario» con el Excel del ERP

Fecha: 18/11/2026 · Base: commit `1c66d65` (5.149-5.150) · Estado: **listo para pegar en VSC, testear y desplegar**

Todo lo aprobado por el dueño está implementado. Nada de esto corre sin tu despliegue: tu base de datos
no fue tocada en ningún momento durante el desarrollo (el ensayo 17/11 fue 100 % local y el servidor no
se contactó jamás).

---

## 1 · Qué hace el flujo nuevo (una sola opción)

**Admin → «Actualizar inventario»** (también para gerente y cajero):

1. Se sube el **«REPORTE LISTA DE PRECIOS» en Excel (.xlsx)** del ERP (el de Gabriel: 2.981 filas,
   985 registros, 41 códigos con cero inicial, precios «Precio REF c/Imp» con coma venezolana).
2. **Modo ensayo marcado por defecto**: el primer botón calcula TODO y **no guarda nada**. El resumen
   muestra: precios antes → después, existencias antes → después, borradores que se crearían (con su
   precio), cuántas filas no cambiarían (0 escrituras), basura del ERP filtrada y filas-trampa descartadas.
3. Si el resumen cuadra: desmarcar «Modo ensayo» → **«Actualizar de verdad»**.

El upsert es el literal que pediste:
- **Existe** → actualiza **precio** (REF c/Imp, CON decimales) + **stock** (Existencia entera).
- **No existe** → se crea **borrador INACTIVO, SIN categoría, CON precio y existencia** — lo completas
  y lo activas donde corresponde desde Productos.
- **Solo se escriben los cambios reales** (el ensayo con tu archivo dio 982 de 985 filas → 0 escrituras
  contra la referencia del 17/11). Re-importar el mismo archivo es un no-op.
- **Precio 0 o ilegible**: al existente NO se le toca el precio (un 0 sería un producto gratis) pero su
  stock SÍ se actualiza; el nuevo nace igual (inactivo, precio 0) y queda señalado en el resumen.
- **Filas-trampa del ERP** (997 «COMPRAS GRAVABLES», 998 «COMPRAS EXENTAS»): descartadas SIEMPRE —
  «realmente no son productos». Aparecen contadas en el resumen.
- **Los 501 borradores antiguos NO se tocan** (tu instrucción).
- El botón **«Importar PDF» desaparece de Productos** (su código de servidor queda dormido, se borra en
  la limpieza 5.154 cuando confirmes que el Excel corre bien).

## 2 · La firma «quién lo ejecutó por última vez con fecha y hora»

Donde está el botón vive la tarjeta **«Última actualización»**: nombre, rol y fecha-hora en **hora de
Venezuela** de la última corrida real, más el archivo, las filas y los conteos. Debajo, el historial de
las últimas 5 corridas. Cada corrida real deja 1 registro en la colección `inventoryImports` escrito por
el servidor (el cliente solo lee; reglas: admin/gerente/cajero leen, delivery no, nadie escribe).

## 3 · Archivos de la ronda (lo único que cambia)

NUEVOS (6):
- `functions/src/lib/listaPreciosXlsx.ts` — lector del Excel: multi-bloque de encabezados, decimales VE,
  códigos como texto (ceros iniciales intactos), filtra depósitos/portada/pies, descarta filas-trampa,
  y **calibra las columnas con la estructura real de las filas de datos** (hallazgo verificado sobre tu
  archivo: las anclas del encabezado NO alinean con los datos — leer por el encabezado habría vaciado
  TODOS los precios).
- `functions/src/__tests__/lista-precios-xlsx.test.ts` — fixture con la estructura real del archivo.
- `functions/src/__tests__/lista-precios-xlsx-real.test.ts` — validación contra el archivo real
  (983 = 985 del ERP − 2 trampas). Busca el Excel en: `EXCEL_LISTA_PRECIOS` (variable de entorno con
  la ruta completa) → copia en la RAÍZ del repo → raíz/upload/ → functions/. Si no está en la
  máquina, los 4 tests nacen SALTADOS y la corrida queda en verde (nunca falla por ausencia).
  OJO: las cifras exactas (D22-850, 75920913…) son del export del 17/11 — con un export MÁS NUEVO
  del ERP la suite puede fallar sin ser bug: eso lo valida el ensayo del panel, no este fixture.
- `functions/src/__tests__/import-actualizar.test.ts` — Reglas 1-4, roles y alta con precio.
- `src/features/admin/pages/AdminInventarioPage.tsx` — la página nueva.
- `src/tests/actualizar-inventario-5153.test.ts` — helpers (validación de archivo + hora Venezuela).

MODIFICADOS (11):
- `functions/src/importInventory.ts` — modo `'actualizar'` (coreActualizar): emparejamiento code/sku
  idéntico a los otros modos, planActualizar (Reglas 1-4), escrituras solo de lo que cambia, loteados a
  450 y en paralelo; roles por modo (cajero entra SOLO en actualizar); registro de corrida
  `inventoryImports` + writeAudit; tope `MAX_FILAS_ACTUALIZAR = 5000` (margen para el crecimiento que
  esperas — subible cambiando esa constante); `timeoutSeconds: 120` en la variante callable (solo
  aplica si algún día corres los cores como Cloud Functions de Blaze — ver §5: en Netlify el tope
  real es 26 s y la corrida cabe de sobra).
- `functions/package.json` + `functions/package-lock.json` — dependencia nueva `xlsx` (SheetJS)
  **0.20.3 desde el CDN oficial** (`cdn.sheetjs.com`): la copia del registro npm quedó congelada en
  0.18.5 y arrastra avisos de seguridad (prototype pollution + ReDoS, corregidos por SheetJS en
  0.19.3/0.20.2 solo en su CDN). `npm ci` de Netlify y de CI la resuelve por URL del lockfile.
- `package.json` + `package-lock.json` de la RAÍZ — la MISMA `xlsx` 0.20.3 (CDN) como dependencia
  de la raíz: el empaquetador de Netlify (y `netlify dev`) resuelve los paquetes que usan las
  funciones desde el `node_modules` de la RAÍZ — misma mecánica que `pdfjs-dist`, `firebase-admin`
  y `firebase-functions`, que ya viven en la raíz por ese motivo. Sin ella, `netlify dev` sirve
  `fn-importInventory` con 500 «Cannot find package 'xlsx'» (el bundle sale sin el paquete y la
  raíz no tiene nada que resolverlo). Hallado probando con netlify dev antes de publicar.
- `firestore.rules` — lectura de `inventoryImports` para admin/gerente/cajero; escritura jamás en cliente.
- `src/app/router.tsx` — ruta `/admin/inventario` con guard cajero/gerente/admin.
- `src/features/admin/pages/AdminLayout.tsx` — ítem de menú «Actualizar inventario» + subtítulo del cajero.
- `src/features/admin/pages/AdminProductsPage.tsx` — QUITADO el botón «Importar PDF» y su modal de 3 modos.
- `src/features/admin/services/admin.service.ts` — `adminActualizarInventario`, lecturas de
  última/historial, `validarArchivoActualizar` (.xlsx hasta 6 MB).
- `src/shared/lib/tiempos.ts` — `fechaCaracasDe()` (hora Venezuela, jamás «Invalid Date»).

## 4 · Cómo probarlo en tu PC (VSC)

```bash
# 1) Pega los archivos (o extrae el ZIP sobre la raíz del repo)

# 2) Dependencia nueva en la RAÍZ (xlsx del CDN: la resuelve el bundling
#    de Netlify y netlify dev)
npm install

# 3) Dependencia nueva del lector de Excel
cd functions
npm install

# 4) Tests del servidor (25 archivos)
npx vitest run
#   · SIN el Excel en la máquina: 243 passed | 18 skipped (la suite del archivo real nace saltada)
#   · CON el Excel (variable EXCEL_LISTA_PRECIOS o copia en la raíz del repo):
#       247 passed | 14 skipped
#   Lección 5.151 corregida: en Vitest la factory de describe.skip SÍ se ejecuta (registra los tests
#   que salta), así que la lectura/parse viven a nivel de módulo y el parse es perezoso — sin el
#   archivo la suite queda en verde, nunca ENOENT.

# 5) Build de functions
npm run build

# 6) Tests y build del frontend (esperado: 478 passed · 37 archivos)
cd ..
npm run typecheck
npm test
npm run build:only
```

¿Probar con el servidor local antes de publicar? `npx netlify-cli login` → `npx netlify-cli link`
(elige tu sitio) → `npx netlify-cli dev`: sirve la PWA en http://localhost:8888 CON las funciones
reales (la terminal muestra el log de cada lambda). Lee las variables del `.env` de la raíz (mismas
claves y valores que el panel de Netlify; el `.env` está en .gitignore y no se sube). Con «Modo
ensayo» marcado es idéntico al flujo de producción y NO escribe nada. IMPORTANTE: en local no
desmarques el ensayo — netlify dev no es un emulador: apunta a tu proyecto REAL de Firebase.

## 5 · Despliegue a producción (en este orden)

**Arquitectura Lite de este proyecto** (docs/DESPLIEGUE.md §3): las funciones de
servidor NO viven en Firebase — viven en Netlify. `fn-importInventory` importa el
core desde `functions/src` y Netlify lo empaqueta al compilar el sitio. Por eso:

- `firebase deploy --only firestore:rules` → publica SOLO las reglas en Firebase.
  Es **exactamente lo mismo** que abrir Firebase Console → Firestore → Reglas,
  pegar el archivo y «Publicar» (efecto idéntico: reemplaza el ruleset completo).
- `firebase deploy --only functions` → **NO se usa en este proyecto**: no tiene
  nada que ver con las funciones de Netlify (esas se actualizan solas con el
  push, cuando Netlify re-empaqueta el sitio). Además el plan Spark no permite
  desplegar Cloud Functions: ese paso fallaría. La versión anterior de este
  LEEME lo traía por error — corregido aquí.

```bash
# 1) Reglas de Firestore (CLI o consola, da igual: el resultado es el mismo)
firebase deploy --only firestore:rules

# 2) Frontend + funciones de Netlify: commit y push → Netlify publica el sitio
#    Y re-empaqueta fn-importInventory con el lector de Excel nuevo. IMPORTANTE:
#    el build de Netlify corre `npm install` (raíz) y `npm --prefix functions ci`
#    (netlify.toml): instala la dependencia nueva `xlsx` para el bundling — por
#    eso functions/package.json, functions/package-lock.json Y TAMBIÉN el
#    package.json y package-lock.json de la RAÍZ DEBEN ir en el commit.
git add -A
git commit -m "5.151-5.153: actualizar inventario con Excel del ERP (upsert + roles + corridas)"
git push
```

Prefieres la consola en vez del CLI (paso 1)? Igual de válido: en Firebase
Console → Firestore Database → Reglas, pega el archivo `firestore.rules`
completo y «Publicar». El archivo entregado = tus reglas publicadas + UN bloque
nuevo (`inventoryImports`): nada más cambia, y las reglas van PRIMERO para que
la lectura de `inventoryImports` ya esté permitida cuando la página nueva
aparezca (la escritura la hace el servidor con Admin SDK, que ignora reglas).

Nota de margen: en Netlify el tope por request es 26 s; con tu archivo la
corrida cabe de sobra (lectura ~300 ms + escrituras solo de lo que cambia:
el ensayo dio 3 cambios de stock sobre 983 filas). El `timeoutSeconds: 120`
del core solo aplica a la variante Cloud Functions del plan Blaze, que aquí
no se usa.

Tras el deploy, verifica en orden:
1. Entra al panel → verás «Actualizar inventario» en el menú (cajero también; delivery no).
2. La tarjeta dice «Aún no se ha actualizado…» (normal: todavía no hay corridas).
3. Sube el Excel con «Modo ensayo» marcado → revisa el resumen (filas, cambios, borradores, trampas).
4. Desmarca ensayo → «Actualizar de verdad» → la tarjeta ahora muestra TU nombre, tu rol, fecha y hora
   de Venezuela y los conteos.
5. Productos → los nuevos están INACTIVOS y sin categoría, con precio y stock ya cargados.

## 6 · Pendientes aparte (no bloquean nada)

- **Limpieza 5.154** (cuando confirmes que el Excel funciona bien): borrar el código PDF dormido
  (parsers y modal viejo quedan sin usar en el servidor hasta entonces).
- **Purga de los 501 borradores antiguos**: NO se tocó nada, como pediste. Cuando quieras hacerla, se
  corre aparte con backup JSON descargable antes de borrar nada.

## 7 · Números del ensayo real (17/11, con TU archivo Gabriel)

| Métrica | Valor |
|---|---|
| Filas de la hoja | 2.981 |
| Productos útiles | 985 según el ERP − 2 filas-trampa = **983 reales** |
| Basura filtrada | 1.995 filas (depósitos, portada, pies) |
| Códigos duplicados | 0 |
| Códigos con cero inicial | 41 (intactos, como texto) |
| Filas sin precio legible | 0 |
| Lectura del Excel | ~300 ms |
| Cambios vs referencia del 17/11 | 3 stocks (0,3 %) · 982 sin cambio · 0 altas |
| Lotes de escritura en el peor caso | 3 lotes de ≤450 (983 altas) |
