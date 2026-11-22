/**
 * GUARDIÁN 5.162 · La CSP (netlify.toml) y las rutas runtime del service
 * worker (vite.config.ts) NO pueden desincronizarse.
 *
 * Mecánica (documentada en netlify.toml desde 5.90.2): cuando el SW pide una
 * imagen con fetch() DENTRO de su propio contexto, ese fetch NO lo gobierna
 * el img-src de la página sino el **connect-src** de la CSP que viaja con
 * sw.js (la cabecera global /* también cubre /sw.js). Toda ruta runtime
 * cross-origin de vite.config necesita su host en connect-src, o el SW ve
 * «Refused to connect … violates CSP» → no-response → foto que jamás entra
 * al cache y consola ruidosa.
 *
 * Historial de esta misma mina (2 veces):
 *   · 5.90.2 — CacheFirst de i.ibb.co (5.75) sin i.ibb.co en connect-src:
 *     fotos rotas / «FOTO PENDIENTE» en producción.
 *   · 5.162 — la 5.160 añadió CacheFirst para las hospederías de respaldo
 *     (iili.io, freeimage.host, Cloudinary, catbox) y nadie las agregó a
 *     connect-src: «Connecting to https://iili.io/….jpg violates
 *     connect-src» en la consola del dueño.
 *
 * Este test extrae los hosts https de TODOS los urlPattern de vite.config.ts
 * y exige que cada uno viva en el connect-src de netlify.toml. Si añades una
 * hospedería al SW, añádela a la CSP en el mismo commit — o esto se pone
 * rojo antes de llegar a producción.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const RAIZ = fileURLToPath(new URL('../..', import.meta.url));
const netlifyToml = readFileSync(join(RAIZ, 'netlify.toml'), 'utf8');
const viteConfig = readFileSync(join(RAIZ, 'vite.config.ts'), 'utf8');

// Hosts https declarados en los urlPattern del SW. En el fuente los puntos y
// slashes están escapados (\., \/) — el token tipo dominio exige al menos un
// punto escapado, así que «jpg|jpeg|png» (sin punto) y «\/img\/» quedan fuera.
const lineasPattern = viteConfig.split('\n').filter((l) => l.includes('urlPattern:'));
const hostsSw = new Set<string>();
for (const linea of lineasPattern) {
  for (const m of linea.matchAll(/[a-z0-9-]+(?:\\\.[a-z0-9-]+)+/g)) {
    hostsSw.add(m[0].replace(/\\/g, ''));
  }
}

// El connect-src de la CSP que viaja con sw.js (misma cabecera /*).
const connectSrc = netlifyToml.match(/connect-src ([^;\n]+);/)?.[1] ?? '';

describe('5.162 · guardián CSP ↔ runtimeCaching del service worker', () => {
  it('la CSP de netlify.toml tiene un connect-src explícito', () => {
    expect(connectSrc.length).toBeGreaterThan(50);
  });

  it('el guardián encontró los hosts conocidos en los urlPattern del SW', () => {
    // Si esto se rompe, alguien movió/refactorizó vite.config y el guardián
    // dejó de ver los hosts — hay que actualizarlo a mano.
    for (const h of [
      'i.ibb.co',
      'firebasestorage.googleapis.com',
      'iili.io',
      'freeimage.host',
      'res.cloudinary.com',
      'files.catbox.moe',
      'firestore.googleapis.com',
    ]) {
      expect(hostsSw.has(h), `urlPattern dejó de declarar ${h}`).toBe(true);
    }
  });

  it('todo host https de un urlPattern vive en connect-src (mecánica 5.90.2)', () => {
    const fuera = [...hostsSw].filter((h) => !connectSrc.includes(h));
    expect(
      fuera,
      `hosts del SW fuera de connect-src de netlify.toml: ${fuera.join(', ')}` +
        ' — añádelos a connect-src en el MISMO commit (ver historial 5.90.2/5.162)',
    ).toEqual([]);
  });
});
