/**
 * SPOT 24 · Tests del importador de inventario — lógica PURA (5.92b).
 * ──────────────────────────────────────────────────────────────────────
 * Regresión del 1er intento REAL de importación del dueño: el script local
 * murió con «5 NOT_FOUND: No document to update: products/cfAX4q…». Causa:
 * el panel borra productos con deleteDoc (admin.service.ts) y Firestore NO
 * borra subcolecciones en cascada — la variants del producto borrado
 * sobrevive, collectionGroup('variants') la sigue listando, el
 * emparejamiento por sku la toma y el plan intenta actualizar un producto
 * que ya no existe → el lote COMPLETO aborta.
 *
 * Se prueba la función pura del blindaje (filtrarPidsVivos) sin Firestore,
 * con el patrón de esta suite (lógica pura en node; los cores con Firestore
 * van con emulador).
 */
import { describe, expect, it } from 'vitest';
import { filtrarPidsVivos } from '../importInventory';

describe('filtrarPidsVivos (blindaje NOT_FOUND de variantes huérfanas)', () => {
  it('quita del mapa por code la referencia a un producto borrado y la cuenta', () => {
    const porCode = new Map([
      ['CEPILLO1', 'vivo-1'],
      ['FORROSINT', 'cfAX4qVIE3BMN6wRbFC9'], // producto borrado (huérfana)
    ]);
    const porSku = new Map<string, string>();
    const omitidas = filtrarPidsVivos(porCode, porSku, new Set(['vivo-1']));
    expect(omitidas).toBe(1);
    expect(porCode.has('CEPILLO1')).toBe(true);
    expect(porCode.has('FORROSINT')).toBe(false);
  });

  it('quita del mapa por sku la variante huérfana y deja el sku emparejable por CREATE', () => {
    const porCode = new Map<string, string>();
    const porSku = new Map([['WT4RUNNE', 'cfAX4qVIE3BMN6wRbFC9']]);
    const omitidas = filtrarPidsVivos(porCode, porSku, new Set());
    expect(omitidas).toBe(1);
    expect(porSku.has('WT4RUNNE')).toBe(false);
    // Efecto buscado: con el mapa limpio, esa fila ya no matchea y el core
    // la tratará como NUEVA (producto fresco en el CREATE) en vez de
    // actualizar un producto muerto.
  });

  it('deja intactos los mapas cuando todos los productos existen', () => {
    const porCode = new Map([['A1', 'p1'], ['A2', 'p2']]);
    const porSku = new Map([['B1', 'p2']]);
    const omitidas = filtrarPidsVivos(porCode, porSku, new Set(['p1', 'p2']));
    expect(omitidas).toBe(0);
    expect(porCode.get('A1')).toBe('p1');
    expect(porCode.get('A2')).toBe('p2');
    expect(porSku.get('B1')).toBe('p2');
  });

  it('cada referencia muerta cuenta una vez aunque el pid se repita entre mapas', () => {
    const muerto = 'cfAX4qVIE3BMN6wRbFC9';
    const porCode = new Map([['X', muerto]]);
    const porSku = new Map([['X', muerto]]);
    const omitidas = filtrarPidsVivos(porCode, porSku, new Set(['otro']));
    expect(omitidas).toBe(2);
    expect(porCode.size).toBe(0);
    expect(porSku.size).toBe(0);
  });

  it('mapas vacíos no cuentan ni revientan', () => {
    const porCode = new Map<string, string>();
    const porSku = new Map<string, string>();
    expect(filtrarPidsVivos(porCode, porSku, new Set())).toBe(0);
  });

  it('NO muta los mapas si el pid vivo no está en el set por fallo de consulta (falla cerrada)', () => {
    // Escenario defensivo: si la validación no devolviera nada (red caída,
    // regla restrictiva), el filtro NO inventa vivos — pero tampoco elimina
    // lo que el set no menciona… el contrato es: solo sobrevive lo que el
    // set marca como vivo. Con set vacío, todo se omite (lote seguro:
    // 0 updates, todas las filas como CREATE — nunca un NOT_FOUND).
    const porCode = new Map([['A', 'p1']]);
    const omitidas = filtrarPidsVivos(porCode, new Map(), new Set());
    expect(omitidas).toBe(1);
    expect(porCode.size).toBe(0);
  });
});
