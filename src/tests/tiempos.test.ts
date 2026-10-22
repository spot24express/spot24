import { describe, it, expect } from 'vitest';
import { aMillis, dedupePorId } from '@/shared/lib/tiempos';

/**
 * Ronda 5.92e — normalización de fechas de Firestore y dedupe de la
 * paginación infinita del catálogo.
 *
 * REGRESIÓN del bug del dueño: importó 72 productos en UN lote (todos con
 * createdAt = Timestamp idéntico de serverTimestamp) y el catálogo mostró
 * «Encountered two children with the same key» ×12 con «Cargar más» que
 * nunca terminaba — porque Number(Timestamp) = NaN rompía el cursor y la
 * página 2 repetía la página 1. Los ids de producto usados abajo son los
 * reales que aparecieron en la consola.
 */

describe('aMillis — normaliza cualquier fecha de Firestore a epoch-ms', () => {
  it('número epoch-ms pasa tal cual', () => {
    expect(aMillis(1761066000000)).toBe(1761066000000);
    expect(aMillis(0)).toBe(0);
  });

  it('NaN e Infinity del dato viejo roto → 0 (jamás NaN)', () => {
    expect(aMillis(NaN)).toBe(0);
    expect(aMillis(Infinity)).toBe(0);
    expect(aMillis(-Infinity)).toBe(0);
  });

  it('REGRESIÓN 5.92e: Timestamp real del SDK (toMillis) → ms finitos', () => {
    // Firestore Timestamp creado como {seconds, nanoseconds} con método toMillis()
    const ts = {
      seconds: 1761066000,
      nanoseconds: 123000000,
      toMillis: () => 1761066000123,
    };
    expect(aMillis(ts)).toBe(1761066000123);
    expect(Number.isFinite(aMillis(ts))).toBe(true); // ← antes: NaN
  });

  it('Timestamp pelado {seconds, nanoseconds} (JSON/Admin) → ms con redondeo', () => {
    expect(aMillis({ seconds: 1761066000, nanoseconds: 500000000 })).toBe(1761066000500);
    expect(aMillis({ seconds: 1761066000, nanoseconds: 999999999 })).toBe(1761066001000);
    expect(aMillis({ seconds: 1761066000 })).toBe(1761066000000); // sin nanoseconds
  });

  it('Date de JS → getTime()', () => {
    const d = new Date('2026-10-21T00:00:00.000Z');
    expect(aMillis(d)).toBe(d.getTime());
    expect(aMillis(new Date('fecha inválida'))).toBe(0);
  });

  it('string numérico → número; string basura → 0', () => {
    expect(aMillis('1761066000000')).toBe(1761066000000);
    expect(aMillis('Timestamp(seconds=1761066000)')).toBe(0);
    expect(aMillis('')).toBe(0);
    expect(aMillis('   ')).toBe(0);
  });

  it('null, undefined y objetos raros → 0', () => {
    expect(aMillis(null)).toBe(0);
    expect(aMillis(undefined)).toBe(0);
    expect(aMillis({})).toBe(0);
    expect(aMillis({ seconds: 'no-soy-numero' })).toBe(0);
    expect(aMillis(true)).toBe(0);
  });

  it('cursor: con aMillis el cursor SIEMPRE decodifica (bug raíz)', () => {
    // Simula el encodeCursor/decodeCursor del catálogo con un Timestamp real:
    // ms finito → cursor "ms|id" → decode Number() finito → startAfter SÍ se arma.
    const ms = aMillis({ seconds: 1761066000, nanoseconds: 123000000, toMillis: () => 1761066000123 });
    const cursor = btoa(`${ms}|xly03xRJ4uKn5cWsMXM1`);
    const [t, id] = atob(cursor).split('|');
    expect(Number.isFinite(Number(t))).toBe(true);
    expect(id).toBe('xly03xRJ4uKn5cWsMXM1');
  });
});

describe('dedupePorId — cinturón de seguridad de la grilla del catálogo', () => {
  const idsDeLaConsola = [
    'xly03xRJ4uKn5cWsMXM1', 'wtRJCpoBtNQQczKRwyvc', 'uxOu8HvVfPFq6VDt0Gk5',
    'tHoxml4tjTMCIndJ4heW', 'tEaI8HLnurRCESGF8bdQ', 't9mBoSz9APeIL2j9T3vs',
  ];

  it('quita repetidos de dos páginas solapadas (regresión exacta)', () => {
    const pag1 = idsDeLaConsola.map((id) => ({ id }));
    const pag2 = idsDeLaConsola.map((id) => ({ id })); // misma página repetida
    const items = dedupePorId([...pag1, ...pag2]);
    expect(items).toHaveLength(6);
    expect(items.map((p) => p.id)).toEqual(idsDeLaConsola);
  });

  it('conserva la primera aparición y el orden', () => {
    const items = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'a', v: 99 }, { id: 'c', v: 3 }];
    expect(dedupePorId(items)).toEqual([
      { id: 'a', v: 1 },
      { id: 'b', v: 2 },
      { id: 'c', v: 3 },
    ]);
  });

  it('sin repetidos y vacío quedan intactos', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(dedupePorId(items)).toEqual(items);
    expect(dedupePorId([])).toEqual([]);
  });
});
