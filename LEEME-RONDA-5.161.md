# RONDA 5.161 · Retiro del import por PDF dormido (cierra la pendiente 5.154)

**Motivo:** la ronda 5.151-5.153 sacó el botón «Importar PDF» del panel y dejó el código del
servidor «dormido» a la espera de tu confirmación de que el Excel del ERP corre bien en
producción (LEEME 5.151-5.153 §1 y LEEME 5.155 §2). Confirmada: el Excel lleva días corriendo
3 veces al día (y la 5.157 lo abarató). Hoy se borra el código muerto, tal como quedó acordado.

**Base:** tu push de hoy (`283d466`, 5.156-5.158) + la ronda 5.160. **Cero solapamiento** con
los archivos de la 5.160: pueden ir en deploys separados o juntos (ver LEEME-DIA-300-CREDITOS).

## Qué se borra (todo era código muerto, sin ningún botón que lo llamara)

| Archivo | Qué era | Estado |
|---|---|---|
| `functions/src/lib/extraerPdf.ts` | extracción de texto con **pdfjs-dist** | BORRADO |
| `functions/src/lib/inventarioPdf.ts` | parser de los 3 formatos PDF | BORRADO |
| `functions/src/lib/pdfjs.d.ts` · `pdfjs-worker.d.ts` | tipos de pdfjs | BORRADOS |
| `functions/src/__tests__/import-precios.test.ts` | 21 tests del modo «precios» (PDF) | BORRADO |
| `functions/src/__tests__/import-stock-ensayo.test.ts` | 7 tests del modo «stock» (PDF) | BORRADO |
| `src/tests/inventario-pdf.test.ts` | 45 tests del pipeline PDF | BORRADO |
| `adminImportInventory()` (frontend) | llamada al import PDF — **sin llamadores desde la 5.153** | BORRADA |
| `pdfjs-dist` en los 2 `package.json` | dependencia solo del PDF | RETIRADA |

## Qué se conserva (byte a byte igual)

- **El modo «actualizar» (Excel del ERP) NO cambia ni una línea de lógica**: `coreActualizar`,
  `planActualizar`, `sembrarVivosDeLecturas` (5.157), blindaje 5.92b, lotes, auditoría y el
  registro en `inventoryImports` quedan intactos. Sus tests siguen pasando (import-actualizar 18,
  import-vivos 8, lista-precios-xlsx 16 + 4 con el archivo real).
- El tipo `FilaInventario` y `numeroVe` (que el lector Excel heredó del parser PDF) se mudaron a
  **`functions/src/lib/filasInventario.ts`** — mismo contenido, nuevo hogar.
- El **export PDF del panel** (jsPDF, `exportarInventario.ts`) NO se toca: es una función viva
  distinta (imprimir inventario), no el import dormido.

## Cambios de contrato (defensivos, pensados para nunca confundir)

- `modoDe`: los modos viejos («completo»/«stock»/«precios») ahora dan un error EXPLÍCITO
  «El import por PDF se retiró (5.161)… usa el modo actualizar con el Excel del ERP» — antes
  caían en silencio al modo «completo» muerto. Nada legítimo los envía (el panel manda
  `'actualizar'` desde la 5.151).
- `ResumenImportacion`: fuera `sinMatch` (solo del modo precios); `tiempos.msPdf` → `msArchivo`
  (el panel ignora ese campo, verificado).
- `importInventory.ts`: **1579 → 800 líneas** (−779).

## Números medidos en esta ronda

| Métrica | Antes | Después |
|---|---|---|
| Bundle de `fn-importInventory` (esbuild) | ~4.1 MB | **785 kB** (pdfjs aportaba 3.37 MB) |
| Dependencia `pdfjs-dist` | en raíz y functions | **fuera de ambas** |
| Tests functions | 256 + 14 saltados | **222 + 14 saltados** |
| Tests raíz | 504 | **459** (sin los 45 del PDF) |
| `importInventory.ts` | 1579 líneas | **800 líneas** |

Arranque de función más ligero (menos memoria y menos frío) y el branch de dependabot
`pdfjs-dist-6.4.299` queda obsoleto (puedes cerrar ese PR, ya no hay nada que actualizar).

## Cómo aplicar (VSC, Windows)

1. Extraer el zip **después** del de la 5.160, sobre `C:\Users\Erick\spot24` (12 archivos con su
   ruta relativa; `package.json` y `package-lock.json` de raíz y de functions vienen incluidos).
2. **Borrar a mano los 7 archivos** que el zip no puede borrar por ti (PowerShell):
   ```powershell
   del functions\src\lib\extraerPdf.ts, functions\src\lib\inventarioPdf.ts, functions\src\lib\pdfjs.d.ts, functions\src\lib\pdfjs-worker.d.ts, functions\src\__tests__\import-precios.test.ts, functions\src\__tests__\import-stock-ensayo.test.ts, src\tests\inventario-pdf.test.ts
   ```
3. Verificación local:
   ```bash
   npm test                  # raíz: 459 tests
   npm --prefix functions test   # 222 tests + 14 saltados por entorno
   npm run build             # typecheck + vite + SW
   ```
4. Commit y push (o va junto a la 5.160 — ver LEEME-DIA-300-CREDITOS):
   ```bash
   git add -A
   git commit -m "5.161: retiro el import por PDF dormido (cierra la pendiente 5.154)"
   git push
   ```

## Verificación en producción tras el deploy

1. **Panel → Actualizar inventario (modo ensayo)** con el Excel del ERP: el resumen debe cuadrar
   con el de siempre (precios/altas/sin cambio — el flujo no cambió).
2. La corrida real del turno opera igual y deja su registro con firma en «Última actualización».
3. Panel → Copias: «Crear copia ahora» OK (no cambia, pero es la otra mitad del importador).
4. El export PDF del panel sigue funcionando (no se tocó).

Si algo se viera raro: **Rollback** al deploy anterior (0 créditos) y diagnosticamos con calma.
