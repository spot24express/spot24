# LEEME · Ronda 5.156-5.157-5.158 · Backups desbloqueados + corridas más baratas + buscador de zonas

Fecha: 19/11/2026 (tarde, Caracas) · Base: ronda 5.151-5.155 (en producción) · Estado: **listo para pegar en VSC, testear y desplegar — UN SOLO commit y UN SOLO push** (economía de créditos de Netlify: 1 push = 1 build).

Tres rondas pequeñas e independientes, pedidas por el dueño tras la queja de un comprador y la auditoría de lecturas de Firestore:

1. **5.156 · Tope de backups 1000 → 1500.** El catálogo real tiene **1017 productos** y el tope viejo
   dejaba el backup nocturno y el manual en **400 perpetuo** (el backend lee ~2.2K lecturas del catálogo
   completo para recién entonces rechazar la copia). Con 1500 el respaldo vuelve a funcionar SIN costo
   extra: esas lecturas ya se estaban pagando. El snapshot de 1500 productos ronda los ~5 MB, muy por
   debajo del tope de 20 MB. El espejo del panel (validación antes de subir) se sube igual.
2. **5.157 · Corrida «Actualizar inventario» ~30% más barata en lecturas.** La pasada «blindaje de
   vivos» (5.92b) re-leía por `documentId` TODOS los productos emparejados — incluidos los que la
   consulta por `code` acababa de devolver. Un documento que una consulta sobre la colección `products`
   devuelve **existe por definición**, así que esa segunda lectura era redundante: ~1 lectura extra por
   producto en CADA corrida (ensayo o real). Con tu catálogo: **~965 lecturas ahorradas por corrida**
   (~3.3K → ~2.3K). Con 3 turnos diarios son ~2.900 lecturas/día recuperadas (≈6% de la cuota diaria).
3. **5.158 · Buscador de zonas en el checkout** (queja real de un comprador: «no existe nada para
   buscar la zona y hay que scrollear para encontrarla»). El `<select>` nativo se cambia por un
   **campo de búsqueda + lista filtrada en el cliente**: escribe «iba» y queda solo «Ibatis · Envío
   Bs X · N-M min». **Cero lecturas de Firestore nuevas** — las zonas ya viajan cargadas por `useZones`
   (caché de 15 min): filtrar en el cliente es gratis. Vale para el comprador Y para el modo
   «entrega a terceros» (mismo componente).

---

## 1 · Por qué NO rompe nada (diseño defensivo de la ronda)

**5.156 — solo se amplía un tope:**
- Dos líneas que apuntan a la MISMA constante (`MAX_PRODUCTOS` en `functions/src/backups.ts`, usada
  por el guardado del backup y por la validación del restore) + el espejo `MAX_PRODUCTOS_COPIA` del
  panel (`src/features/admin/services/backups.service.ts`). Nada más cambia: bytes, chunks, retención,
  rotación, variantes por producto — intactos.
- Una copia de 1017 productos pasa a ser VÁLIDA (test nuevo que lo afirma) y 1501 sigue rechazándose.

**5.157 — misma respuesta observable, menos lecturas:**
- La semilla nueva (`sembrarVivosDeLecturas`, función PURA) produce **exactamente el mismo
  `pidsVivos` y el mismo `nombrePorPid`** que la pasada vieja: los emparejados por código nacen vivos
  (una consulta jamás devuelve docs borrados, y traen `name` a bordo); los emparejados por **SKU de
  variante** siguen re-leyéndose por `documentId` en tandas de 30 — esos sí pueden ser huérfanos
  (collectionGroup lista variantes de productos borrados). El blindaje 5.92b queda INTACTO y con tests.
- Solo se toca el modo «actualizar» (el Excel que corre el cajero 3 veces/día). Los modos PDF
  (`completo`/`stock`/`precios`) NO se tocan.
- Verificación de campo incluida: tu ensayo de esta mañana dio **52 altas / 257 valores / 708 sin
  cambio**. La primera corrida real tras el push debe reproducir esas cifras — ese resumen ES el
  comprobante de que el emparejamiento quedó idéntico.

**5.158 — mismo estado, mismos datos, misma ficha:**
- El estado que viaja NO cambia: sigue siendo `address.zoneId` y `tercero.zoneId` (mismo onChange,
  misma validación con `errors['zoneId']` / `errors['terceroZoneId']` — la obligatoriedad la sigue
  validando el paso Entrega).
- El texto de cada fila lo escribe el llamador (`feeTexto`): «Envío Bs X · N-M min» con el MISMO
  `liveRate` y `formatBs` de las options viejas — un solo lugar, cero duplicación.
- Botones siempre `type="button"` (el checkout es un formulario: un submit accidental NO puede
  adelantar pasos). Accesible: `radiogroup` + `aria-checked`, teclado incluido.
- Si el filtro no encuentra nada, mensaje amable; si las zonas están cargando, aviso de carga;
  si no hay zonas, aviso claro. La búsqueda nunca auto-selecciona: solo filtra.

## 2 · Archivos de la ronda (lo único que cambia)

NUEVOS (4):
- `functions/src/__tests__/import-vivos-5157.test.ts` — 8 tests de la semilla + flujo combinado con
  `filtrarPidsVivos` (huérfano se omite igual que antes; sku vivo verificado sobrevive).
- `src/features/checkout/lib/zonas.ts` — lógica PURA del filtro (normaliza tildes/mayúsculas,
  coincide por nombre y estado; consulta vacía = todas).
- `src/features/checkout/components/SelectorZona.tsx` — buscador + lista táctil (comprador y tercero).
- `src/tests/zonas-buscador-5158.test.ts` — 10 tests del filtro (parcial por nombre, sin tildes,
  por estado, vacío, sin coincidencia, contrato de zonas activas).

MODIFICADOS (7):
- `functions/src/backups.ts` — `MAX_PRODUCTOS` 1000 → 1500 (con comentario del motivo).
- `functions/src/__tests__/backups-core.test.ts` — el test del tope empuja 1501 y exige «(tope 1500)»;
  test nuevo: 1017 productos (tu catálogo de hoy) ES válido.
- `src/features/admin/services/backups.service.ts` — espejo del tope en el panel: 1500.
- `src/tests/backup-file.test.ts` — mismo ajuste del espejo (1501 rechazada, motivo «1501»).
- `functions/src/importInventory.ts` — `coreActualizar` siembra vivos desde la lectura por código y
  solo re-lee los pids emparejados por SKU (helper puro exportado para tests).
- `src/features/checkout/pages/CheckoutPage.tsx` — los dos `<Select>` de zona → `<SelectorZona>` +
  `feeTextoZona` (la ficha de tarifa/ETA, texto idéntico al de las options viejas).
- `LEEME-RONDA-5.156-5.157-5.158.md` — este archivo.

## 3 · Números para el dueño (con Blaze pendiente, Spark aguanta más)

| Concepto | Antes | Después de la ronda |
|---|---|---|
| Corrida real «actualizar» (~965 emparejados) | ~3.3K lecturas | **~2.3K lecturas** |
| 3 turnos/día, corrida real directa | ~10K lecturas/día | **~7K lecturas/día (14%)** |
| Backup nocturno | 2.2K lecturas y **400 al final** | mismas lecturas y **backup OK** |
| Buscar zona en checkout | scrollear | escribir 2-3 letras |

Recuerda el plan acordado: 1 corrida real por cambio de turno (el ensayo solo para cajeros nuevos,
cambios de formato del ERP o dudas) — con la ronda aplicada, el día completo queda ~25-32% de la
cuota y hay colchón para duplicar el catálogo.

## 4 · Cómo desplegar (UN commit, UN push)

1. Extrae el zip `ronda-5.156-5.157-5.158.zip` DIRECTAMENTE sobre la carpeta del repo
   (`C:\Users\Erick\spot24`): los 11 archivos ya vienen con su ruta relativa y caen en su sitio
   (4 nuevos + 7 que reemplazan a los tuyos). También puedes pegarlos a mano uno a uno.
2. Nada extra queda en el repo tras extraer: el zip NO trae archivos que no vayan al commit.
3. Testea en local antes del push:
   - `npm test` (raíz: 500 tests — incluye los 10 nuevos del buscador de zonas)
   - `npm --prefix functions test` (256 tests + 14 saltados por entorno, igual que antes)
   - `npm run build` (typecheck + vite build + service worker PWA)
4. Commit único (ningún archivo de más):
   ```
   git add functions/src/backups.ts functions/src/importInventory.ts functions/src/__tests__/backups-core.test.ts functions/src/__tests__/import-vivos-5157.test.ts src/features/admin/services/backups.service.ts src/features/checkout/lib/zonas.ts src/features/checkout/components/SelectorZona.tsx src/features/checkout/pages/CheckoutPage.tsx src/tests/zonas-buscador-5158.test.ts src/tests/backup-file.test.ts LEEME-RONDA-5.156-5.157-5.158.md
   git commit -m "5.156-5.158: tope de backups 1500, corridas 30% más baratas en lecturas y buscador de zonas en el checkout"
   git push
   ```
5. Netlify arma y publica (1 build). Verificación en producción tras el deploy:
   - Checkout → Entrega (delivery): la zona se puede BUSCAR; al elegirla, cotiza y la revisión muestra
     «Envío» con la zona elegida (el flujo de cotización no cambió).
   - Panel → Actualizar inventario: el modo ensayo corre igual; su resumen debe cuadrar con el
     baseline (52 / 257 / 708).
   - Panel → Copias: «Crear copia ahora» debe terminar OK (con catálogo 1017) y la nocturna deja de
     fallar con 400.
   - Backup nocturno: la próxima corrida automática debe registrarse sin 400.
