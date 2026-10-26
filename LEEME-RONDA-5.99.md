# RONDA 5.99 · Hotfix: mover productos a una subcategoría

## Qué resuelve (tu reporte de hoy)

> «Tengo una categoría llamada Lubricantes y aditivos que tiene 42 productos y
> quiero crear una subcategoría llamada Lubricantes, entonces me sugiere
> moverlos a Lubricantes que es la nueva subcategoría pero no la hace y me sale
> esto: "Algo salió fuera de línea. Para. Resuelve. Sigue: reintenta en unos
> segundos."»

**Encontrado y arreglado de raíz.** Verifiqué tu producción real (solo lectura)
antes de tocar una línea: los 42 productos están ahí, intactos, y la causa del
error es exacta y comprobada.

## El problema, en cristiano

- Tus reglas de Firestore (de la ronda 3, cuando TODO producto se creaba a mano
  con marca) exigen que la marca tenga **al menos 1 letra**.
- Pero el **importador del POS** (desde la 5.87) crea los productos **sin
  marca** — así nacieron 456 de tus 552 productos, incluidos los 42 de
  «Lubricantes y Aditivos».
- Al aceptar mover los 42, el panel intenta actualizar los 42 documentos y
  **las reglas rechazan el primero** por no tener marca → todo el lote se
  cancela → el mensaje genérico «Algo salió fuera de línea». No era la red ni
  el servidor: era una regla vieja que quedó corta.
- El importador no lo chocó porque entra por el servidor (Admin SDK, que no
  pasa por las reglas) — esa asimetría es la que escondió el bug hasta hoy.
- **Efecto secundario que ya tenías sin saber**: esos 456 productos sin marca
  eran intocables desde el panel también para REORDENAR/BORRAR fotos y para
  editar sin inventar una marca. Todo eso queda arreglado con el mismo golpe.
- **Y otro detalle**: como el aviso te pedía reintentar, cada intento CREÓ la
  subcategoría «Lubricantes» antes de fallar el movimiento — hoy tienes **4
  «Lubricantes» iguales** dentro de «Lubricantes y Aditivos». Abajo te dejo el
  paso para limpiarlas (2 minutos).

## Los cambios, en tu idioma

1. **Reglas de Firestore** (`firestore.rules`): la marca pasa de «1 a 60
   letras» a «0 a 60 letras». El tope de 60 y el resto de validaciones quedan
   IDÉNTICOS (sigue sin poder escribir quien no sea admin/gerencia; ningún
   permiso nuevo para clientes). Es un relax mínimo y quirúrgico.
2. **Tu panel ya no te deja duplicar categorías** (`AdminCategoriesPage.tsx`):
   si escribes un nombre que ya existe en el mismo lugar, te avisa al instante
   («Ya existe "Lubricantes" dentro de esa categoría…») y no crea nada. Esto
   viene directo de lo que pasó hoy con los 4 duplicados.
3. **Marca opcional en el formulario de productos** (`AdminProductsPage.tsx`):
   antes te OBLIGABA a escribir una marca para guardar cualquier ajuste de un
   producto importado (precio, stock, fotos…). Ahora es opcional, igual que en
   el importador. De paso se blindó el SKU interno para que nunca quede corto
   (las reglas de variantes piden 3+ letras).
4. **Pruebas nuevas** (en tu repo, no viajan en el lote porque requieren
   emulador): mover un producto sin marca a otra categoría, crear producto sin
   marca, y la marca que SÍ sigue limitada a 60. Las 21 pruebas de reglas
   pasaron contra el emulador real de Firestore.

## Despliegue — pasos EN ESTE ORDEN

### Paso 1 · Publica las reglas (esto ya solo DESBLOQUEA el movimiento)

Puedes hacerlo de las dos formas (la que uses, el resultado es el mismo):

- **Con el CLI** (como hiciste con los índices en su día), en
  `C:\Users\Erick\spot24` después de copiar el archivo del paso 2… o copia el
  archivo primero y luego:
  ```powershell
  npx firebase-tools deploy --only firestore:rules
  ```
- **Sin CLI (Consola)**: Firebase Console → Firestore Database → pestaña
  **Reglas** → borra todo, pega el contenido COMPLETO del `firestore.rules` de
  este lote → **Publicar**.

### Paso 2 · Copia los archivos de esta ronda sobre tu repo

Solo **3 archivos ACTUALIZADOS** (el resto del lote es el mismo que ya tienes):

| # | Archivo | Acción |
|---|---------|--------|
| 1 | `firestore.rules` | ACTUALIZA (la raíz del arreglo) |
| 2 | `src/features/admin/pages/AdminCategoriesPage.tsx` | ACTUALIZA (guarda anti-duplicados) |
| 3 | `src/features/admin/pages/AdminProductsPage.tsx` | ACTUALIZA (marca opcional) |
| 4 | (referencia) `LEEME-RONDA-5.99.md` | este archivo |

Cópialos respetando las carpetas, sobre `C:\Users\Erick\spot24`.

### Paso 3 · `git push` (Netlify arma y publica el panel actualizado)

Después del push tu panel tendrá la guarda anti-duplicados y la marca
opcional. El movimiento de productos NO depende del push: con el Paso 1 ya
funciona — pero hazlo todo junto para ir ordenado.

### Paso 4 · Limpia las 4 «Lubricantes» y haz el movimiento (2 minutos)

1. Panel → **Categorías**: dentro de «Lubricantes y Aditivos» verás **4
   subcategorías «Lubricantes» idénticas** (quedaron de los reintentos de hoy,
   todas vacías). **Elimina las 4.** Ninguna tiene productos; el panel te deja
   sin protestar.
2. Crea de nuevo la subcategoría: «Nueva categoría» → nombre `Lubricantes` →
   Ubicación: «Dentro de: Lubricantes y Aditivos» → al guardar te aparece el
   aviso de siempre («tiene 42 productos directos… Aceptar = moverlos ahora»)
   → **Aceptar**.
3. Esta vez SÍ: verás «Categoría guardada · 42 productos movidos a
   "Lubricantes"». En la lista, «Lubricantes y Aditivos» queda con sus
   subcategorías y **sin el cartel ⚠ de productos directos ocultos**.

### Paso 5 · Comprueba en la tienda

- Catálogo → bahía «Lubricantes y Aditivos»: se ven las tarjetas de
  subcategorías (Lubricantes + las que tengas) y DENTRO de «Lubricantes» los
  42 productos.
- Nada de eso se ve raro en el resto de la tienda: las otras bahías siguen
  iguales.

## Verificado antes de entregar

- Typecheck ×3 (raíz ×2 + functions): **OK, silenciosos**.
- Lint: **0 errores** (10 warnings preexistentes, los mismos de siempre).
- Tests raíz (vitest): **193 pasan · 21 en su archivo aparte**.
- **Tests de reglas contra el EMULADOR real de Firestore: 21/21** (18 previos +
  3 nuevos de esta ronda — incluida la reproducción EXACTA de tu caso: update
  de un producto importado sin marca).
- Tests functions: **46 pasan · 14 skipped por entorno**.
- Build de producción: **verde, precache 115** (el mismo número de siempre).
- Producción inspeccionada SOLO LECTURA (REST): 26 categorías, los 42 productos
  de «Lubricantes y Aditivos» con `brand: ''` confirmado uno a uno contra la
  simulación de las reglas — 42/42 fallaban con la regla vieja, 42/42 pasan con
  la nueva.
- Cero escrituras en tu Firestore desde el laboratorio.

## Notas técnicas (por si las necesitas)

- La regla tocada es UNA línea en `productValid()` de `firestore.rules`:
  `str(d.brand, 1, 60)` → `str(d.brand, 0, 60)`. Todo lo demás (roles, órdenes,
  carritos, usuarios, denegación por defecto) quedó byte a byte igual.
- Las escrituras del panel van DIRECTAS del navegador a Firestore (por diseño,
  para que el panel siga funcionando aunque el servidor esté caído) — por eso
  las reglas de producción son las que deciden, y por eso el arreglo ES una
  regla y no código.
- El emparejamiento de futuras importaciones NO se rompe si editas un producto
  importado desde el panel: el importador encuentra el producto por su
  **código** (`code`, el del POS) y, si ninguna variante lleva ese sku, actualiza
  la primera variante del doc (línea probada del importador).
- Si algún día quieres marcar en bloque a los sin-marca con una marca real
  («Genérica», «Importación», etc.), se puede con un script de una vez con
  respaldo, igual que la normalización de fechas. No hace falta para nada de
  esto: la marca vacía ya es ciudadana de primera.
