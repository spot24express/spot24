/**
 * Ronda 5.93 · AUTOPSIA del 500 de fn-reserveStock — tests de regresión.
 *
 * El 500 de producción tenía DOS caminos sin diagnóstico (ambos escapaban
 * como «internal» opaco porque el error crudo NO traía `code`):
 *  1) id con ruta inválida → doc() lanza «Invalid document reference»;
 *  2) número corrupto → NaN → NaN se colaba por las comparaciones y llegaba
 *     a tx.update({stock: NaN}) → Firestore rechazaba la escritura.
 * isSafeDocId/finiteNum (items.ts) cortan ambos: los ids malos dan 400
 * accionable y los números corruptos coaccionan a 0 (stock honesto o
 * hold saneado). Este archivo congela ese contrato.
 */
import { describe, it, expect } from 'vitest';
import { extractItems, isSafeDocId, finiteNum } from '../lib/items';

describe('isSafeDocId — ids que no revientan doc() (5.93)', () => {
  it('acepta los ids reales del sistema (auto-ID de Firestore y códigos)', () => {
    expect(isSafeDocId('Kq8x2vTn5pYq9Z1aBcDe')).toBe(true);
    expect(isSafeDocId('10500060')).toBe(true);
    expect(isSafeDocId('aceite-10w40')).toBe(true);
    expect(isSafeDocId('A_b-C.9')).toBe(true);
  });

  it('rechaza lo que hace lanzar a Firestore: separador de ruta', () => {
    // El caso exacto de la autopsia: products/{'a/b'}/variants/{c} →
    // «Invalid document reference» SIN código → 500 opaco.
    expect(isSafeDocId('a/b')).toBe(false);
    expect(isSafeDocId('products/x')).toBe(false);
    expect(isSafeDocId('/')).toBe(false);
  });

  it('rechaza vacío, ., .. y prefijo reservado __', () => {
    expect(isSafeDocId('')).toBe(false);
    expect(isSafeDocId('.')).toBe(false);
    expect(isSafeDocId('..')).toBe(false);
    expect(isSafeDocId('__meta')).toBe(false);
  });

  it('rechaza no-strings y tope de tamaño de Firestore (1500 bytes)', () => {
    expect(isSafeDocId(null)).toBe(false);
    expect(isSafeDocId(42)).toBe(false);
    expect(isSafeDocId({ id: 'x' })).toBe(false);
    expect(isSafeDocId(undefined)).toBe(false);
    expect(isSafeDocId('x'.repeat(1500))).toBe(true);
    expect(isSafeDocId('x'.repeat(1501))).toBe(false);
  });
});

describe('finiteNum — nunca NaN hacia tx.update (5.93)', () => {
  it('coacciona no-finitos a 0 (el NaN que mataba las transacciones)', () => {
    expect(finiteNum(NaN)).toBe(0);
    expect(finiteNum(Infinity)).toBe(0);
    expect(finiteNum(-Infinity)).toBe(0);
  });

  it('coacciona corruptos a 0: null, undefined, string no numérico, objeto', () => {
    expect(finiteNum(null)).toBe(0);
    expect(finiteNum(undefined)).toBe(0);
    expect(finiteNum('n/d')).toBe(0);
    expect(finiteNum({})).toBe(0);
  });

  it('deja pasar los valores legítimos (número y string numérico)', () => {
    expect(finiteNum(5)).toBe(5);
    expect(finiteNum(0)).toBe(0);
    expect(finiteNum(12.5)).toBe(12.5);
    expect(finiteNum('12')).toBe(12);
    expect(finiteNum(-3)).toBe(-3);
  });

  it('el guardia del stock con NaN ya NO se cuela: qty > finiteNum(corrupto) falla honesta', () => {
    // Antes: Number(campo_corrupto ?? 0) = NaN → qty > NaN = false →
    // pasaba la validación y tx.update({stock: NaN}) revientaba como 500.
    const stockCorrupto = finiteNum('n/d'); // 0
    expect(3 > stockCorrupto).toBe(true); // «Sin stock suficiente» (400 honesto)
  });
});

describe('extractItems — contrato de transporte intacto (regresión)', () => {
  it('acepta {items:[...]} (contrato) y el array pelado (cliente antiguo)', () => {
    const items = [{ productId: 'p1', variantId: 'v1', qty: 2 }];
    expect(extractItems({ items })).toEqual(items);
    expect(extractItems(items)).toEqual(items);
  });

  it('devuelve [] para cualquier otra cosa (la validación del core decide)', () => {
    expect(extractItems(null)).toEqual([]);
    expect(extractItems('x')).toEqual([]);
    expect(extractItems({ items: 'no-lista' })).toEqual([]);
  });
});
