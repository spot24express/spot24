/**
 * Guardián de marcas de terceros (5.90.3, pedido del dueño):
 * «el cliente no puede leer en ningún lado la palabra Farmatodo».
 *
 * Escanea TODO el código que puede llegar al navegador (src/, public/ e
 * index.html) buscando nombres de marcas de terceros. Si reaparece una
 * referencia — en un texto visible, un aria-label o un simple comentario —
 * el test FALLA y el push se detiene antes de publicarla.
 *
 * Por qué incluye los comentarios: los comentarios no llegan al bundle
 * (esbuild los elimina y sourcemap=false), pero el repositorio puede
 * volverse público o activarse sourcemaps algún día — la regla del dueño
 * es «en ningún lado», así que se aplica a todo el código cliente.
 *
 * La lista es extensible: añadir la marca en minúsculas basta.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/** Marcas de terceros que NO deben aparecer jamás en el código cliente. */
const MARCAS_PROHIBIDAS = ['farmatodo'];

/** Raíz del proyecto (…/spot24): este test vive en src/tests/. */
const RAIZ = fileURLToPath(new URL('../..', import.meta.url));

/** Extensiones de texto que se escanean (el resto son binarios/fuentes). */
const TEXTUALES = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.json', '.html', '.css', '.svg', '.webmanifest', '.txt',
]);

/** Archivo del propio guardián: contiene las marcas en su lista blanca. */
const AUTO = fileURLToPath(new URL('.', import.meta.url));

/** Recorre el directorio y devuelve la ruta de cada archivo textual. */
function* archivos(dir: string): Generator<string> {
  for (const entrada of readdirSync(dir, { withFileTypes: true })) {
    const ruta = join(dir, entrada.name);
    if (entrada.isDirectory()) yield* archivos(ruta);
    else if (TEXTUALES.has(entrada.name.slice(entrada.name.lastIndexOf('.')).toLowerCase())) yield ruta;
  }
}

describe('guardián de marcas de terceros en el código cliente', () => {
  it('ni una sola marca prohibida en src/, public/ e index.html', () => {
    const objetivos: string[] = [
      ...archivos(join(RAIZ, 'src')),
      ...archivos(join(RAIZ, 'public')),
      join(RAIZ, 'index.html'),
    ].filter((ruta) => !ruta.startsWith(AUTO));

    const hallazgos: string[] = [];
    for (const ruta of objetivos) {
      const lineas = readFileSync(ruta, 'utf8').split('\n');
      lineas.forEach((linea, i) => {
        for (const marca of MARCAS_PROHIBIDAS) {
          if (linea.toLowerCase().includes(marca)) {
            hallazgos.push(`${ruta.replace(RAIZ, '')}:${i + 1} → «${marca}»`);
          }
        }
      });
    }

    expect(
      hallazgos,
      `La marca de tercero reapareció — redáctala (el dueño pidió que el cliente jamás la lea):\n${hallazgos.join('\n')}`,
    ).toEqual([]);
  });
});
