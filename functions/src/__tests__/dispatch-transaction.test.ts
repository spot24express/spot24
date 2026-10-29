/**
 * SPOT 24 · Ronda 5.112.1 — REGRESIÓN de la transacción de coreUpdateOrderStatus.
 * ────────────────────────────────────────────────────────────────────────────
 * Reporte del dueño (netlify dev, pedido SP-261029-0007 de retiro en tienda):
 * al marcar Entregado, 4 de 5 intentos devolvieron 500 con
 *   «Firestore transactions require all reads to be executed before all
 *    writes»  (dispatch.ts, bucle del contador vendidosTotal).
 * Causa: el bucle intercalaba tx.get→tx.update POR PRODUCTO; con 2+ productos
 * distintos la 2.ª lectura llegaba después de la 1.ª escritura. Determinista
 * (también fallaría en producción) y afectaba a TODO pedido de 2+ productos,
 * con envío o retiro.
 *
 * Cómo lo fija esta suite: una transacción ESTRICTA que replica la regla de
 * Firestore — revienta en el momento en que alguien lee tras haber escrito.
 * Si coreUpdateOrderStatus vuelve a intercalar lecturas y escrituras, el test
 * muere con el MISMO mensaje que vio el dueño en el terminal.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCtx } from '../lib/ctx';
import { coreUpdateOrderStatus } from '../dispatch';

/* ─────────── Firestore de mentira con regla de transacción estricta ─────────── */

const h = vi.hoisted(() => {
  type Doc = Record<string, unknown>;
  const store = new Map<string, Doc>();
  const txs: Array<{ reads: string[]; writes: string[]; ops: string[] }> = [];

  /** Réplica de la regla real: get() tras cualquier write() LANZA. */
  class StrictTx {
    reads: string[] = [];
    writes: string[] = [];
    ops: string[] = [];
    constructor() {
      txs.push({ reads: this.reads, writes: this.writes, ops: this.ops });
    }
    async get(ref: { path: string }) {
      if (this.writes.length > 0) {
        throw new Error(
          'Firestore transactions require all reads to be executed before all writes.',
        );
      }
      this.reads.push(ref.path);
      this.ops.push(`get ${ref.path}`);
      const data = store.get(ref.path);
      return { exists: data !== undefined, data: () => (data ? { ...data } : undefined), ref };
    }
    update(ref: { path: string }, _patch: Doc): StrictTx {
      this.writes.push(ref.path);
      this.ops.push(`update ${ref.path}`);
      return this;
    }
    set(ref: { path: string }, _data: Doc, _opts?: unknown): StrictTx {
      this.writes.push(ref.path);
      this.ops.push(`set ${ref.path}`);
      return this;
    }
  }

  function makeRef(segments: string[]) {
    const path = segments.join('/');
    return {
      id: segments[segments.length - 1],
      path,
      collection: (sub: string) => makeRef([...segments, sub]),
      doc: (id?: string) =>
        makeRef([...segments, id ?? `ev-${Math.random().toString(36).slice(2, 9)}`]),
      get: async () => {
        const data = store.get(path);
        return { exists: data !== undefined, data: () => (data ? { ...data } : undefined) };
      },
    };
  }

  const firestoreInstance = {
    collection: (name: string) => makeRef([name]),
    doc: (p: string) => makeRef(p.split('/')),
    runTransaction: async <T,>(fn: (tx: StrictTx) => Promise<T>): Promise<T> => fn(new StrictTx()),
  };

  const firestoreFn = Object.assign(() => firestoreInstance, {
    FieldValue: { increment: (n: number) => ({ __op: 'increment', by: n }) },
  });

  const fns = {
    send: vi.fn(async () => {}),
    sendDispatchAlert: vi.fn(async () => {}),
    writeAudit: vi.fn(async () => {}),
  };

  const reset = (seed: Record<string, Doc>): void => {
    store.clear();
    txs.length = 0;
    fns.send.mockClear();
    fns.sendDispatchAlert.mockClear();
    fns.writeAudit.mockClear();
    for (const [k, v] of Object.entries(seed)) store.set(k, v);
  };

  return { txs, fns, firestoreFn, reset };
});

vi.mock('firebase-admin', () => ({ default: { firestore: h.firestoreFn } }));
vi.mock('firebase-functions/v2/https', () => {
  class HttpsError extends Error {
    code: string;
    constructor(code: string, message: string) {
      super(message);
      this.code = code;
      this.name = 'HttpsError';
    }
  }
  return { HttpsError, onCall: (..._args: unknown[]) => undefined };
});
vi.mock('../lib/ctx', () => ({ getAdminApp: () => ({}) }));
vi.mock('../lib/notifications', () => ({
  ORDER_NOTIFICATIONS: { send: h.fns.send, sendDispatchAlert: h.fns.sendDispatchAlert },
}));
vi.mock('../payments', () => ({ writeAudit: h.fns.writeAudit }));

/* ─────────── Datos de prueba ─────────── */

const LINEAS_DOS_PRODUCTOS = [
  { productId: 'p1', variantId: 'v1', qty: 2 },
  { productId: 'p2', variantId: 'v2', qty: 1 },
];

function seedPedido(status: string, mode: 'pickup' | 'delivery'): Record<string, Record<string, unknown>> {
  return {
    'orders/o1': {
      status,
      code: 'SP-261029-0007',
      uid: 'u1',
      delivery: { mode },
      lines: LINEAS_DOS_PRODUCTOS,
    },
    'products/p1': { name: 'Producto Uno', vendidosTotal: 5 },
    'products/p2': { name: 'Producto Dos', vendidosTotal: 0 },
  };
}

function ctxCon(to: string, role = 'admin'): CoreCtx {
  return {
    auth: { uid: 'staff-1', token: { role } },
    data: { orderId: 'o1', to },
  } as unknown as CoreCtx;
}

beforeEach(() => h.reset(seedPedido('preparado', 'pickup')));

/* ─────────── La regresión ─────────── */

describe('5.112.1 · transacción de entrega: lecturas ANTES que escrituras', () => {
  it('retiro en tienda, 2 productos distintos: contadores suman y la tx no viola el orden', async () => {
    const out = (await coreUpdateOrderStatus(ctxCon('entregado'))) as {
      ok: boolean;
      trackingCode: string | null;
    };

    expect(out.ok).toBe(true);
    // El retiro NO genera código de tracking (no hay ruta que seguir).
    expect(out.trackingCode).toBeNull();

    expect(h.txs).toHaveLength(1);
    const tx = h.txs[0]!;
    // El StrictTx ya habría LANZADO con el mensaje del dueño si se leyera
    // después de escribir; la aserción explícita documenta el orden esperado.
    expect(tx.reads).toEqual(['products/p1', 'products/p2']);
    expect(tx.ops.slice(0, 2)).toEqual(['get products/p1', 'get products/p2']);
    expect(tx.writes.filter((w) => w.startsWith('products/'))).toEqual([
      'products/p1',
      'products/p2',
    ]);
    expect(tx.writes).toContain('orders/o1');

    // Notificación de RETIRO (no «en ruta») + auditoría.
    expect(h.fns.send).toHaveBeenCalledWith('u1', 'SP-261029-0007', 'entregado', 'pickup');
    expect(h.fns.sendDispatchAlert).not.toHaveBeenCalled();
    expect(h.fns.writeAudit).toHaveBeenCalledTimes(1);
  });

  it('envío a domicilio (en_camino → entregado) con 2 productos: mismo orden estricto', async () => {
    h.reset(seedPedido('en_camino', 'delivery'));
    // Realista: pasó por en_camino → ya llevaba su código de seguimiento.
    const seeded = seedPedido('en_camino', 'delivery');
    (seeded['orders/o1'] as Record<string, unknown>)['delivery'] = {
      mode: 'delivery',
      trackingCode: 'SP-TRK-654321',
    };
    h.reset(seeded);

    const out = (await coreUpdateOrderStatus(ctxCon('entregado'))) as {
      ok: boolean;
      trackingCode: string | null;
    };

    expect(out.ok).toBe(true);
    expect(out.trackingCode).toBe('SP-TRK-654321'); // conserva el que ya tenía
    expect(h.txs[0]!.reads).toEqual(['products/p1', 'products/p2']);
    expect(h.fns.send).toHaveBeenCalledWith('u1', 'SP-261029-0007', 'entregado', 'delivery');
  });

  it('en_camino de un ENVÍO: genera tracking y NO toca contadores de vendidos', async () => {
    h.reset(seedPedido('preparado', 'delivery'));

    const out = (await coreUpdateOrderStatus(ctxCon('en_camino'))) as { trackingCode: string };

    expect(out.trackingCode).toMatch(/^SP-TRK-\d{6}$/);
    expect(h.txs[0]!.reads).toEqual([]); // sin entregado → sin lecturas de productos
    expect(h.fns.send).toHaveBeenCalledWith('u1', 'SP-261029-0007', 'en_camino', 'delivery');
  });

  it('un pedido de UN solo producto también cierra bien (caso que sí pasaba antes)', async () => {
    h.reset({
      'orders/o1': {
        status: 'preparado',
        code: 'SP-261029-0009',
        uid: 'u1',
        delivery: { mode: 'pickup' },
        lines: [{ productId: 'p1', variantId: 'v1', qty: 3 }],
      },
      'products/p1': { name: 'Único', vendidosTotal: 7 },
    });

    const out = await coreUpdateOrderStatus(ctxCon('entregado'));
    expect(out).toMatchObject({ ok: true });
    expect(h.txs[0]!.reads).toEqual(['products/p1']);
  });
});

describe('5.112.1 · candados de la modalidad en coreUpdateOrderStatus', () => {
  it('un retiro JAMÁS pasa por en_camino: rechazo SIN transacción ni notificación', async () => {
    await expect(coreUpdateOrderStatus(ctxCon('en_camino'))).rejects.toMatchObject({
      code: 'failed-precondition',
    });
    expect(h.txs).toHaveLength(0);
    expect(h.fns.send).not.toHaveBeenCalled();
  });

  it('replay idempotente: pedido ya entregado → ok sin reescribir ni notificar', async () => {
    h.reset(seedPedido('entregado', 'pickup'));

    const out = await coreUpdateOrderStatus(ctxCon('entregado'));

    expect(out).toMatchObject({ ok: true, alreadyApplied: true });
    expect(h.txs).toHaveLength(0);
    expect(h.fns.send).not.toHaveBeenCalled();
  });

  it('cierre del retiro: el CAJERO sí puede entregar en mostrador', async () => {
    const out = await coreUpdateOrderStatus(ctxCon('entregado', 'cajero'));
    expect(out).toMatchObject({ ok: true });
    expect(h.txs[0]!.writes).toContain('orders/o1');
  });

  it('el DELIVERY no cierra un retiro (no hay ruta que hacer)', async () => {
    await expect(coreUpdateOrderStatus(ctxCon('entregado', 'delivery'))).rejects.toMatchObject({
      code: 'permission-denied',
    });
    expect(h.txs).toHaveLength(0);
  });
});
