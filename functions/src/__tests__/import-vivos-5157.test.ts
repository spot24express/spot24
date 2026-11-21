/**
 * Tests del ahorro de lecturas 5.157 (sembrar vivos desde la lectura por código).
 * ─────────────────────────────────────────────────────────────
 * La pasada «blindaje de vivos» (5.92b) re-leía por documentId TODOS los
 * productos emparejados — incluidos los que la consulta por 'code' acababa de
 * devolver. Un doc que una consulta sobre la colección products devuelve
 * EXISTE por definición, así que esa segunda lectura era redundante para los
 * emparejados por código: ~1 lectura extra por producto del catálogo en cada
 * corrida (ensayo o real).
 *
 * La semilla es una función PURA: los emparejados por código nacen vivos (con
 * su nombre), y SOLO los pids emparejados por SKU de variante van a
 * pidsPorVerificar — esos sí pueden ser huérfanos (collectionGroup sigue
 * listando variantes de productos borrados), el blindaje queda intacto.
 */
import { describe, expect, it } from 'vitest';
import { filtrarPidsVivos, sembrarVivosDeLecturas } from '../importInventory';

/** Falso QueryDocumentSnapshot: solo id + data() — suficiente por DocMinimo. */
const doc = (id: string, name: string) => ({ id, data: () => ({ name }) });

describe('sembrarVivosDeLecturas (5.157 · vivos sin re-lectura)', () => {
  it('los emparejados por código nacen VIVOS y con nombre: 0 re-lecturas', () => {
    const docs = [doc('p1', 'ACEITE 10W40'), doc('p2', 'FILTRO A-101')];
    const r = sembrarVivosDeLecturas(docs, []);
    expect(r.pidsVivos).toEqual(new Set(['p1', 'p2']));
    expect(r.nombrePorPid.get('p1')).toBe('ACEITE 10W40');
    expect(r.nombrePorPid.get('p2')).toBe('FILTRO A-101');
    expect(r.pidsPorVerificar).toEqual([]);
  });

  it('los emparejados SOLO por sku van a la lista de verificación', () => {
    const docs = [doc('p1', 'ACEITE 10W40')];
    const r = sembrarVivosDeLecturas(docs, ['p-sku-huerfano-candidato', 'p-sku-otro']);
    expect(r.pidsVivos).toEqual(new Set(['p1']));
    expect(r.pidsPorVerificar).toEqual(['p-sku-huerfano-candidato', 'p-sku-otro']);
  });

  it('un pid sku que YA nació vivo por código NO se re-lee', () => {
    const docs = [doc('p1', 'ACEITE 10W40')];
    const r = sembrarVivosDeLecturas(docs, ['p1', 'p2']);
    expect(r.pidsPorVerificar).toEqual(['p2']);
    expect(r.pidsVivos.has('p1')).toBe(true);
  });

  it('los pids sku llegan DEDUPLICADOS', () => {
    const r = sembrarVivosDeLecturas([], ['p9', 'p9', 'p8', 'p9']);
    expect(r.pidsPorVerificar).toEqual(['p9', 'p8']);
  });

  it('sin lecturas ni skus: todo vacío (corrida sin filas emparejadas)', () => {
    const r = sembrarVivosDeLecturas([], []);
    expect(r.pidsVivos.size).toBe(0);
    expect(r.nombrePorPid.size).toBe(0);
    expect(r.pidsPorVerificar).toEqual([]);
  });

  it('el nombre faltante cae en "" (String(undefined ?? "")) — igual que antes', () => {
    const r = sembrarVivosDeLecturas([{ id: 'p1', data: () => ({}) }], []);
    expect(r.nombrePorPid.get('p1')).toBe('');
  });
});

describe('el blindaje 5.92b queda INTACTO con la semilla (flujo combinado)', () => {
  it('sku huérfano (su re-lectura no devuelve nada) se OMITE igual que antes', () => {
    // p1 existe (por código). El sku mapea a un pid huérfano «p-fantasma»:
    // su tanda documentId vuelve vacía → pidsVivos sigue sin él → filtrarPidsVivos
    // lo elimina y lo cuenta, EXACTAMENTE el contrato viejo.
    const productoPorCode = new Map([['MT-01', 'p1']]);
    const productoPorSku = new Map([['MT-01-ALT', 'p-fantasma']]);
    const { pidsVivos } = sembrarVivosDeLecturas([doc('p1', 'MT-01 BATERÍA')], productoPorSku.values());
    // …la tanda de pidsPorVerificar=['p-fantasma'] volvería SIN resultados:
    expect(pidsVivos.has('p-fantasma')).toBe(false);
    const omitidas = filtrarPidsVivos(productoPorCode, productoPorSku, pidsVivos);
    expect(omitidas).toBe(1);
    expect(productoPorSku.has('MT-01-ALT')).toBe(false);
    expect(productoPorCode.has('MT-01')).toBe(true); // el código sigue emparejado
  });

  it('sku vivo verificado por documentId sobrevive al filtro', () => {
    const productoPorCode = new Map([['MT-01', 'p1']]);
    const productoPorSku = new Map([['MT-01-ALT', 'p2']]);
    const { pidsVivos, pidsPorVerificar } = sembrarVivosDeLecturas([doc('p1', 'MT-01')], productoPorSku.values());
    expect(pidsPorVerificar).toEqual(['p2']);
    // …la re-lectura documentId de p2 SÍ lo devuelve:
    pidsVivos.add('p2');
    const omitidas = filtrarPidsVivos(productoPorCode, productoPorSku, pidsVivos);
    expect(omitidas).toBe(0);
    expect(productoPorSku.get('MT-01-ALT')).toBe('p2');
  });
});
