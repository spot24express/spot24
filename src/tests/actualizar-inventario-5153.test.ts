/**
 * Tests de la ronda 5.153 (Actualizar inventario: página, roles y firma).
 * Los helpers son PURA lógica sin DOM/Firestore:
 *  · validarArchivoActualizar — el .xlsx del ERP sí, el PDF y el exceso de
 *    peso no (el dueño ya no importa PDFs).
 *  · fechaCaracasDe — la firma «quién · cuándo» se muestra en HORA DE
 *    VENEZUELA aunque el servidor grabe epoch-ms UTC.
 *  · puedeImportarInventario (re-importada del core de functions vía tipo) —
 *    la matriz de roles la cubre la suite de functions; aquí se verifica el
 *    contrato del helper de fecha con valores reales.
 */
import { describe, expect, it } from 'vitest';
import { fechaCaracasDe } from '@/shared/lib/tiempos';
import { validarArchivoActualizar, ACTUALIZAR_PESO_MAX } from '@/features/admin/services/admin.service';

describe('validarArchivoActualizar (5.153 · solo el Excel del ERP)', () => {
  it('un .xlsx pasa limpio', () => {
    expect(validarArchivoActualizar('ListadePreciosGabriel.xlsx', 200_000)).toBe('');
    expect(validarArchivoActualizar('LISTA.XLSX', 1024)).toBe('');
  });
  it('un PDF se rechaza (el dueño ya no importa PDFs)', () => {
    const msg = validarArchivoActualizar('reporte.pdf', 100_000);
    expect(msg).toContain('.xlsx');
  });
  it('cualquier otra extensión se rechaza', () => {
    expect(validarArchivoActualizar('lista.xls', 1000)).toContain('.xlsx');
    expect(validarArchivoActualizar('lista.csv', 1000)).toContain('.xlsx');
    expect(validarArchivoActualizar('sin-extension', 1000)).toContain('.xlsx');
  });
  it('un Excel demasiado pesado se rechaza (límite de la llamada)', () => {
    expect(validarArchivoActualizar('lista.xlsx', ACTUALIZAR_PESO_MAX + 1)).toContain('6 MB');
    expect(validarArchivoActualizar('lista.xlsx', ACTUALIZAR_PESO_MAX)).toBe('');
  });
});

describe('fechaCaracasDe (la firma se lee en hora Venezuela)', () => {
  it('un epoch-ms real se muestra con fecha y hora legibles', () => {
    // 2026-01-15 15:30:00 UTC = 11:30 a.m. en Caracas (UTC-4)
    const ms = Date.UTC(2026, 0, 15, 15, 30, 0);
    const texto = fechaCaracasDe(ms);
    expect(texto).toContain('2026');
    expect(texto).toContain('11:30');
    expect(texto.toLowerCase()).toMatch(/a\.?\s?m\./);
  });
  it('las 20:05 UTC son las 4:05 p. m. en Caracas', () => {
    const ms = Date.UTC(2026, 2, 10, 20, 5, 0);
    const texto = fechaCaracasDe(ms);
    expect(texto).toContain('4:05');
    expect(texto.toLowerCase()).toMatch(/p\.?\s?m\./);
  });
  it('lo desconocido nunca muestra «Invalid Date»', () => {
    expect(fechaCaracasDe(undefined)).toBe('—');
    expect(fechaCaracasDe(0)).toBe('—');
    expect(fechaCaracasDe('no-es-fecha')).toBe('—');
    expect(fechaCaracasDe(null)).toBe('—');
  });
  it('los Timestamp pelados {seconds, nanoseconds} también se leen', () => {
    const ms = Date.UTC(2026, 0, 15, 15, 30, 0);
    const texto = fechaCaracasDe({ seconds: Math.floor(ms / 1000), nanoseconds: 0 });
    expect(texto).toContain('11:30');
  });
});
