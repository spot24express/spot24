/**
 * Tests 5.90 + 5.90.1 · Helpers PUROS del historial de avisos (campana
 * /notificaciones). El conteo del punto rojo, el formato de fecha, el
 * espejo del tope del servidor y el backoff de reconexión se prueban sin
 * Firebase: son la lógica visible del feature.
 */
import { describe, expect, it } from 'vitest';
import {
  contarNoLeidas, fechaCortaNotif, nextReconnectDelayMs, NOTIFS_PAGE_SIZE,
} from '@/features/orders/services/notifs.service';

describe('contarNoLeidas (punto rojo de la campana)', () => {
  it('lista vacía → 0 sin importar la marca', () => {
    expect(contarNoLeidas([], 0)).toBe(0);
    expect(contarNoLeidas([], 999)).toBe(0);
  });

  it('sin marca (0) → todos cuentan como no leídos', () => {
    const avisos = [{ createdAtMs: 100 }, { createdAtMs: 200 }, { createdAtMs: 300 }];
    expect(contarNoLeidas(avisos, 0)).toBe(3);
  });

  it('marca posterior a todos → 0', () => {
    const avisos = [{ createdAtMs: 100 }, { createdAtMs: 200 }];
    expect(contarNoLeidas(avisos, 500)).toBe(0);
  });

  it('marca en medio → solo los posteriores cuentan', () => {
    const avisos = [{ createdAtMs: 100 }, { createdAtMs: 200 }, { createdAtMs: 300 }];
    expect(contarNoLeidas(avisos, 200)).toBe(1);
    expect(contarNoLeidas(avisos, 150)).toBe(2);
  });

  it('empate exacto cuenta como LEÍDO (comparación estricta >)', () => {
    // Caso real: abrir la página adelanta la marca a AHORA; un aviso creado
    // en ese mismo milisegundo no debe volver a encender el punto.
    const avisos = [{ createdAtMs: 1000 }, { createdAtMs: 1000 }];
    expect(contarNoLeidas(avisos, 1000)).toBe(0);
  });

  it('el orden de la lista no afecta el conteo', () => {
    const avisos = [{ createdAtMs: 300 }, { createdAtMs: 100 }, { createdAtMs: 200 }];
    expect(contarNoLeidas(avisos, 250)).toBe(1);
  });
});

describe('fechaCortaNotif (dd/mm/aaaa h:mm a.m./p.m.)', () => {
  it('sin fecha (0, NaN, negativo) → «—»', () => {
    expect(fechaCortaNotif(0)).toBe('—');
    expect(fechaCortaNotif(Number.NaN)).toBe('—');
    expect(fechaCortaNotif(-5)).toBe('—');
  });

  it('formatea con ceros y periodo p.m. (hora local del dispositivo)', () => {
    // Construido con la hora LOCAL para que el test pase en cualquier TZ.
    const d = new Date(2026, 9, 20, 15, 45); // 20/10/2026 3:45 p.m.
    expect(fechaCortaNotif(d.getTime())).toBe('20/10/2026 3:45 p.m.');
    const d2 = new Date(2026, 0, 2, 9, 5); // 02/01/2026 9:05 a.m.
    expect(fechaCortaNotif(d2.getTime())).toBe('02/01/2026 9:05 a.m.');
  });

  it('mediodía es p.m. y medianoche/minutos nocturnos usan 12', () => {
    const mediodia = new Date(2026, 3, 10, 12, 0);
    expect(fechaCortaNotif(mediodia.getTime())).toBe('10/04/2026 12:00 p.m.');
    const madrugada = new Date(2026, 3, 10, 0, 15);
    expect(fechaCortaNotif(madrugada.getTime())).toBe('10/04/2026 12:15 a.m.');
  });
});

describe('acuerdo con el servidor (5.90)', () => {
  it('la página escucha EXACTAMENTE el tope de historial que rota el servidor', () => {
    // functions/src/lib/notifications.ts: NOTIFS_TOPE_POR_USUARIO = 30.
    // Si algún día cambia uno, este test lo recuerda en ambos lados.
    expect(NOTIFS_PAGE_SIZE).toBe(30);
  });
});

describe('nextReconnectDelayMs (backoff de reconexión 5.90.1)', () => {
  it('progresión exponencial: 3 s → 6 s → 12 s → 24 s → 48 s', () => {
    expect(nextReconnectDelayMs(0)).toBe(3000);
    expect(nextReconnectDelayMs(1)).toBe(6000);
    expect(nextReconnectDelayMs(2)).toBe(12000);
    expect(nextReconnectDelayMs(3)).toBe(24000);
    expect(nextReconnectDelayMs(4)).toBe(48000);
  });

  it('techo en 60 s: la campana nunca deja de reintentar, pero no locura', () => {
    expect(nextReconnectDelayMs(5)).toBe(60000);
    expect(nextReconnectDelayMs(10)).toBe(60000);
    expect(nextReconnectDelayMs(1000)).toBe(60000);
  });

  it('intentos basura (negativos, no finitos) cuentan como 0 → 3 s', () => {
    expect(nextReconnectDelayMs(-3)).toBe(3000);
    expect(nextReconnectDelayMs(Number.NaN)).toBe(3000);
    expect(nextReconnectDelayMs(Number.POSITIVE_INFINITY)).toBe(3000);
  });

  it('escenario real del dueño: 3 cortes seguidos de red dejan el canal a 24 s y un snapshot sano resetea (contrato del store)', () => {
    // Documentación ejecutable del ciclo: cada error sube el intento y el
    // snapshot con datos lo devuelve a 0 (store: onData → attempts: 0).
    let attempts = 0;
    const trasError = () => {
      const delay = nextReconnectDelayMs(attempts);
      attempts += 1;
      return delay;
    };
    expect(trasError()).toBe(3000);
    expect(trasError()).toBe(6000);
    expect(trasError()).toBe(12000);
    attempts = 0; // snapshot sano → reset (así lo hace el store al reponer)
    expect(nextReconnectDelayMs(attempts)).toBe(3000);
  });
});
