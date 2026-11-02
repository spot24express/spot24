# SPOT 24 · 5.116 — El escudo llega al archivo REAL de las fotos del panel

## La corrección, con evidencia (y por qué es una buena noticia)

En la 5.115-B te indiqué que las fotos del panel se subían desde
`functions/src/images.ts`. Al revisarlo hoy con evidencia, ese dato era
incompleto: **ese archivo es el núcleo interno heredado y hoy nadie lo
llama** (el `index.ts` de Firebase no registra `uploadImage` como callable y
ningún `fn-*` lo importa).

La ruta **viva** es otra y quedó verificada así:

```
Panel (4 páginas) → imageUpload.service.ts (la puerta del cliente,
                     el archivo que me pegaste — NO se toca)
                   → /.netlify/functions/fn-uploadImage
                   → netlify/functions/fn-uploadImage.ts   ← ESTE archivo
                     trae su propia subida a imgbb DESDE LA RONDA 3
                     (verificado byte a byte contra el zip de esa ronda;
                      ninguna ronda posterior lo ha tocado)
```

Tu pregunta «¿será este?» era la correcta: faltaba el archivo bueno.
Este paquete lo trae corregido con el mismo escudo de siempre.

## Respuesta a tu pregunta: ¿queda todo cubierto?

| Qué se sube | Por dónde sale | ¿Cubierta? |
| --- | --- | --- |
| Comprobante de pago (checkout) | `fn-createOrder` / `fn-uploadReceipt` → orders.ts | ✅ desde la 5.115 |
| Fotos de **productos** | imageUpload.service → `fn-uploadImage` (Netlify) | ✅ 5.116 |
| Fotos de **categorías** | la misma puerta | ✅ 5.116 |
| Fotos de **promos** | la misma puerta | ✅ 5.116 |
| **QR de pago** de Ajustes | la misma puerta | ✅ 5.116 |

Las cuatro últimas usan **la misma puerta** (las 4 páginas del panel importan
`adminUploadImage` de `imageUpload.service.ts`) → **un solo parche las cubre
todas**. Con esto, el 100% de las imágenes de la app queda detrás de la red.

El archivo que me pegaste (`imageUpload.service.ts`) **no lleva parche ni
necesita nada**: nunca habla con imgbb, no lleva claves (esas viven en el
servidor) y su trabajo —no lanzar errores, mensajes amables— sigue igual.

## Qué pegar (3 reemplazos completos, nada más)

**PASO 1 · `netlify/functions/fn-uploadImage.ts`** — el de esta carpeta, tal
cual (ya trae los 2 cortes: el import de la lib de respaldo y el try/catch
con el ayudante `subirAImgbb`). Tu archivo original quedó intacto por dentro:
solo cambió de forma (de flecha a función declarada) para poder envolverlo.

**PASO 2 · `functions/src/images.ts`** — el de esta carpeta (el mismo de la
5.115, PASO 1-B). Es el núcleo interno: hoy no está conectado, pero se blinda
igual por si algún día vuelve a conectarse, y el guardián lo vigila.

**PASO 3 · `src/tests/respaldo-imagenes-5115b.test.ts`** — el de esta
carpeta, **reemplazando** el anterior si ya lo habías pegado (mismo nombre,
no dupliques). Ahora trae **9 pruebas** y vigila los DOS archivos.

Luego: `npm test` desde la raíz → deben ser **332/332**
(314 base + 9 del comprobante [5115] + 9 de las fotos del panel [5115b v2]).

### Si prefieres a mano el PASO 1 (no recomendado)

· **CORTE 1:** junto al import de `CoreCtx`, pega
`import { subirComprobanteRespaldo } from '../../functions/src/lib/imagen-respaldo';`

· **CORTE 2:** reemplaza la línea `  let res: Response;` (la que va después
del chequeo de `IMGBB_API_KEY`) por:

```ts
  try {
    return await subirAImgbb(key, image);
  } catch (eImgbb) {
    const urlRespaldo = await subirComprobanteRespaldo(image).catch(() => null);
    if (urlRespaldo) return { url: urlRespaldo, deleteUrl: '' };
    throw eImgbb;
  }
};

/** 5.116 · La subida original a imgbb, intacta por dentro. */
async function subirAImgbb(
  key: string,
  image: string,
): Promise<{ url: string; deleteUrl: string }> {
  let res: Response;
```

…y el cierre final del bloque (`  return { url, deleteUrl };\n};`) queda
como `  return { url, deleteUrl };\n}` (punto y coma fuera: ahora cierra la
función ayudante). Todo lo demás del archivo no se toca.

## Qué NO cambia

- Cero cambios de UX, Firestore o panel: las 4 páginas ni se enteran.
- **Mismas variables** (`FREEIMAGE_API_KEY`, `RESPALDO_CATBOX`): no
  configuras nada nuevo; la 5.116 comparte la misma lib de la 5.115.
- Con respaldo, `deleteUrl` va vacío: el panel nunca usó ese dato
  (verificado en `imageUpload.service.ts`).
- Cuando imgbb esté caída, la URL guardada puede salir de `iili.io` o
  `freeimage.host` en vez de `i.ibb.co`: se ve igual en la app y es
  permanente.

## Tiempos (honestos)

- imgbb sana: igual que siempre (~1-2 s).
- imgbb colgada: aquí se rinde a los **15 s** (tope del fetch, sin
  reintentos en esta ruta) + freeimage ~2-3 s → ~17-18 s en total, dentro
  del tope de 25 s del navegador.
- Si imgbb **y** freeimage están colgados a la vez: puede rozar el tope de
  25 s → verás el mensaje de siempre y al reintentar vuelve a intentarlo
  (mismo comportamiento que el comprobante).

## Si algo falla en `npm test`

- Falla «RUTA VIVA … importa el respaldo» → el PASO 1 no quedó bien
  reemplazado: copia el archivo completo de esta carpeta.
- Falla «core interno images.ts …» → falta el PASO 2.
- Cuenta distinta a 332 → ¿el 5115b viejo sigue en `src/tests`? Debe haber
  UN solo `respaldo-imagenes-5115b.test.ts` (el nuevo lo reemplaza).
- Falla «el mensaje amigable de imgbb…» (guardián 5115) → tu
  `functions/src/lib/imgbb.ts` no contiene «está caído»; no debería pasar
  (ya lo tienes desde la 5.112-C).

## Después de pegar

Reinicia `netlify dev` completo (las funciones se recompilan al arrancar) y
prueba subiendo una foto de prueba en Productos. Con imgbb sana no verás
NINGUNA diferencia — la red solo actúa cuando imgbb falla. Y recuerda el
pendiente de PROD: `FREEIMAGE_API_KEY` en Netlify (Environment variables) +
redeploy.
