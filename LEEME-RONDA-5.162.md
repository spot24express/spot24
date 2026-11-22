# RONDA 5.162 · La CSP deja entrar al SW las hospederías de respaldo (+ guardián CSP↔SW)

**Motivo:** tras el deploy 5.160+5.161, la consola del dueño mostró en cada visita:
«Connecting to https://iili.io/….jpg violates … connect-src» → «no-response» →
`ERR_FAILED` en fotos del catálogo.

**Causa raíz (honesta): la introdujo la propia 5.160.** La ruta CacheFirst para las
hospederías de respaldo (`iili.io`, `freeimage.host`, `res.cloudinary.com`,
`files.catbox.moe`) era correcta y necesaria — esas fotos (de las noches de caída de
imgbb, ronda 5.115) jamás entraban al cache del SW — pero el fetch que el SW hace DENTRO
de su contexto lo gobierna el **connect-src** de la CSP que viaja con `sw.js` (mecánica
documentada en `netlify.toml` desde la 5.90.2), y esas 4 hospederías no estaban en la
lista. La CSP las rechazaba antes de tocar red. Las imágenes están vivas: verificadas
HTTP 200 con bytes reales. La 5.160 no corrió este riesgo en los tests porque ningún
test cruzaba CSP ↔ rutas del SW — justo el hueco que esta ronda cierra para siempre.

**Qué se veía y qué cambia para el dueño:**

| Antes de la 5.162 | Después |
|---|---|
| Foto de hospedería de respaldo: el SW la rechaza, toca red en cada visita y solo se ve si tenía respaldo en Storage | El SW la baja UNA vez y después la sirve de cache (CacheFirst, inmutables por hash) |
| Consola: «violates connect-src» + no-response + ERR_FAILED por cada foto de esas hospederías | Consola limpia |
| Modo avión: esas fotos fallaban o dependían del respaldo | Las fotos ya vistas aparecen offline como el resto |

## Qué cambia (3 archivos, nada de código de la app)

1. `netlify.toml` — **una línea**: `connect-src` += `https://iili.io https://freeimage.host
   https://res.cloudinary.com https://files.catbox.moe` (+ bloque de comentario 5.162 que
   documenta la decisión, como hace la ronda con cada directiva desde la 5.90.2).
2. `src/tests/csp-runtime-hosts-5162.test.ts` — NUEVO, guardián (3 tests): extrae los hosts
   https de TODOS los `urlPattern` de `vite.config.ts` y exige que cada uno viva en el
   `connect-src` de `netlify.toml`. **Probado en ambos sentidos**: con la CSP vieja se pone
   rojo y nombra exactamente las 4 hospederías faltantes; con la 5.162 queda verde.
3. `LEEME-RONDA-5.162.md` — este archivo.

No se toca: `img-src` (ya era `https:` comodín desde 5.90.2 — las promos pueden apuntar a
cualquier host), la ruta CacheFirst de la 5.160 (se queda, era el arreglo correcto), ni
ninguna otra directiva de la CSP.

## Números verificados en esta ronda

| Métrica | Antes | Después |
|---|---|---|
| Tests raíz | 459 (39 archivos) | **462 en verde (40 archivos)** |
| Tests functions | 222 + 14 saltados | sin cambios |
| Build | typecheck + vite + SW precache 103 | sin cambios (netlify.toml no toca el bundle) |

## Cómo aplicar (VSC, Windows)

1. Extraer `spot24-ronda-5.162.zip` sobre `C:\Users\Erick\spot24` (3 archivos).
2. Verificación local:
   ```bash
   npm test     # raíz: 462 tests (40 archivos)
   ```
   (functions y build no cambian; si quieres correrlos igual, dan lo de siempre.)
3. Commit y push (1 deploy = 15 créditos):
   ```bash
   git add netlify.toml src/tests/csp-runtime-hosts-5162.test.ts LEEME-RONDA-5.162.md
   git commit -m "5.162: CSP deja entrar al SW las hospederias de respaldo (iili.io y compañia) + guardian CSP↔runtimeCaching"
   git push
   ```

## Verificación en producción tras el Published

1. La versión nueva del SW arranca **una instalación nueva del precache**: el ruido
   «Cache.put() encountered a network error» puede aparecer UNA vez más si recargas a
   mitad — deja la pestaña abierta ~30-60 s hasta «activated and running». Es el mismo
   comportamiento benigno de siempre (103/103 entradas verificadas 200 en producción).
2. Abre un producto con foto de iili.io (p. ej. las que la consola nombraba) con la
   consola abierta: **sin** «violates connect-src», **sin** ERR_FAILED. Primera carga baja
   la foto por red; la segunda sale del cache del SW (Network → «disk cache»/ServiceWorker).
3. Modo avión → abrir: las fotos ya vistas —incluidas las de esas hospederías— aparecen.
4. El mensaje del banner de instalación seguirá apareciendo: es el diseño propio de la
   5.109-5.111 (la app usa su botón «Instalar»), no es un error.

**Si algo se viera raro:** Rollback (0 créditos) — solo cambia una cabecera; el peor caso
es volver exactamente al estado anterior.

## Estado del día de los 300 créditos

- Deploy 5.160+5.161: publicado y litmus en curso (reapertura instantánea ya confirmada
  por el dueño; modo avión muestra el catálogo con skeleton breve esperado).
- Este deploy 5.162: 15 créditos → quedarían ~270. El resto del litmus (pedido punta a
  punta, ensayo con el Excel del ERP, corrida real del turno, «Crear copia ahora», export
  PDF) sigue igual — esta ronda no lo toca.
