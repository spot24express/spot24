/**
 * Guardián de la micro-ronda «Cotejo en despacho» (tasa aplicada bajo la
 * línea de CI + ⧉ copiar la referencia completa). Mismo espíritu del
 * guardián 5.114: NO necesita Firebase ni red — lee los archivos reales y
 * garantiza que las piezas están EXACTAS donde deben. Si un paste futuro
 * borra una pieza, este test se rompe y dice qué archivo reponer.
 *
 * Alcance decidido por el dueño: SOLO despacho — la página de Pagos NO se
 * toca (su modal «Revisar» ya muestra la tasa desde la 5.9 y no debe
 * importar la utilería de copiar).
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function leer(rel: string): string {
  try {
    return readFileSync(join(process.cwd(), rel), 'utf-8').replace(/\r\n/g, '\n');
  } catch {
    throw new Error(
      `No pude leer ${rel}. Ejecuta npm test desde la RAÍZ del repo (C:/Users/Erick/spot24).`,
    );
  }
}

const DESPACHO = 'src/features/admin/pages/AdminDispatchPage.tsx';
const PAGOS = 'src/features/admin/pages/AdminPaymentsPage.tsx';

describe('guardián · cotejo en despacho (tasa aplicada + ⧉ copiar referencia)', () => {
  it('la tasa congelada de la orden se muestra bajo la línea de cotejo (espejo del modal de Pagos)', () => {
    const src = leer(DESPACHO);
    expect(src).toContain('Tasa BCV aplicada');
    expect(src).toContain("rateUsed.toLocaleString('es-VE'");
  });

  it('el ⧉ reutiliza la utilería probada del checkout (copyText 5.75) con feedback por toast', () => {
    const src = leer(DESPACHO);
    expect(src).toContain("import { copyText } from '@/shared/lib/clipboard';");
    expect(src).toContain("toast.success('Referencia copiada.')");
  });

  it('el ⧉ SOLO aparece con la referencia EN CLARO (con la enmascarada no hay nada útil que copiar)', () => {
    const src = leer(DESPACHO);
    expect(src).toContain('{o.payment.reference && <CopiarReferencia referencia={o.payment.reference} />}');
  });

  it('el botón es accesible (aria-label) y del tamaño táctil del checkout (h-8 w-8)', () => {
    const src = leer(DESPACHO);
    expect(src).toContain('aria-label="Copiar referencia de pago"');
    expect(src).toMatch(/h-8 w-8/);
  });

  it('ALCANCE: Pagos queda intacto — sin utilería de copiar ahí (decisión del dueño)', () => {
    const src = leer(PAGOS);
    expect(src).not.toContain('@/shared/lib/clipboard');
  });
});
