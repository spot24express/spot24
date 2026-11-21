/**
 * Tests de la ronda 5.158 (queja real de un comprador): el selector de zona
 * del checkout no tenía búsqueda — había que SCROLLEAR toda la lista para
 * encontrar la propia. Ahora el SelectorZona filtra en el cliente.
 *
 * Lógica pura sin DOM ni Firestore: las zonas ya viajan cargadas por useZones
 * (caché 15 min), así que filtrar en el cliente cuesta CERO lecturas nuevas.
 * Se prueban: normalización (tildes/mayúsculas), coincidencia por nombre y
 * por estado, consulta vacía = todas, y el contrato de zonas activas.
 */
import { describe, expect, it } from 'vitest';
import { normalizarZonaTexto, zonasFiltradas } from '@/features/checkout/lib/zonas';
import type { Zone } from '@/features/delivery/types';

const zona = (id: string, name: string, state = 'Aragua'): Zone => ({
  id,
  name,
  state,
  feeUsd: 5,
  freeFromUsd: 0,
  etaMinMinutes: 20,
  etaMaxMinutes: 40,
  windows: [{ start: '08:00', end: '20:00', label: '8:00 am–8:00 pm' }],
  active: true,
});

const CATALOGO = [
  zona('z1', 'Ibatis'),
  zona('z2', 'Maracay Centro'),
  zona('z3', 'Las Delicias'),
  zona('z4', 'La Arboleda'),
  zona('z5', 'San Jacinto', 'Carabobo'),
];

describe('normalizarZonaTexto (5.158 · búsqueda tolerante)', () => {
  it('minúsculas, sin tildes y recortada', () => {
    expect(normalizarZonaTexto('Ibatis')).toBe('ibatis');
    expect(normalizarZonaTexto('  Las Delícias  ')).toBe('las delicias');
    expect(normalizarZonaTexto('ÁÉÍÓÚ ñ')).toBe('aeiou n');
  });
  it('vacío o undefined → cadena vacía (consulta vacía)', () => {
    expect(normalizarZonaTexto('')).toBe('');
    expect(normalizarZonaTexto('   ')).toBe('');
  });
});

describe('zonasFiltradas (5.158 · el buscador que faltaba)', () => {
  it('consulta vacía devuelve TODAS, en orden (nada se oculta por defecto)', () => {
    expect(zonasFiltradas(CATALOGO, '')).toHaveLength(5);
    expect(zonasFiltradas(CATALOGO, '   ').map((z) => z.id)).toEqual(['z1', 'z2', 'z3', 'z4', 'z5']);
  });
  it('por nombre con letras PARCIALES: «iba» encuentra Ibatis', () => {
    expect(zonasFiltradas(CATALOGO, 'iba').map((z) => z.name)).toEqual(['Ibatis']);
  });
  it('SIN TILDES también encuentra: «delicias» y «delícias» dan lo mismo', () => {
    expect(zonasFiltradas(CATALOGO, 'delícias').map((z) => z.name)).toEqual(['Las Delicias']);
    expect(zonasFiltradas(CATALOGO, 'Delicias').map((z) => z.name)).toEqual(['Las Delicias']);
  });
  it('mayúsculas y minúsculas dan lo mismo', () => {
    expect(zonasFiltradas(CATALOGO, 'MARACAY').map((z) => z.name)).toEqual(['Maracay Centro']);
  });
  it('por estado: «carabobo» encuentra la zona de otro estado', () => {
    expect(zonasFiltradas(CATALOGO, 'carabobo').map((z) => z.name)).toEqual(['San Jacinto']);
  });
  it('dos zonas comparten palabra: ambas salen («la»)', () => {
    expect(zonasFiltradas(CATALOGO, 'la ').map((z) => z.id)).toEqual(['z3', 'z4']);
  });
  it('sin coincidencia → lista vacía (el componente muestra el aviso amable)', () => {
    expect(zonasFiltradas(CATALOGO, 'chivacoa')).toEqual([]);
  });
});

describe('contrato del checkout (5.158 · solo pasan zonas ACTIVAS)', () => {
  it('el filtro active del llamador respeta las inactivas — igual que el <select> viejo', () => {
    const conInactiva = [...CATALOGO, { ...zona('z6', 'Zona Pausada'), active: false }];
    // El checkout pasa zones?.filter((z) => z.active); la función no re-filtra
    // active (respetar lo que el llamador manda) — con el input del checkout
    // la pausada jamás aparece.
    const visibles = zonasFiltradas(conInactiva.filter((z) => z.active), 'pausada');
    expect(visibles).toEqual([]);
  });
});
