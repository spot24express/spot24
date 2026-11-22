/**
 * 5.163 · Usuarios del panel en DOS grupos (features/admin/lib/usuariosGrupos).
 * Pedido del dueño: al entrar a Usuarios, el PERSONAL (cajeros, deliverys,
 * gerentes y admins) y los CLIENTES deben verse separados y cada grupo con su
 * número. La separación es pura y se prueba sin Firestore.
 */
import { describe, expect, it } from 'vitest';
import { esPersonal, separarUsuarios } from '@/features/admin/lib/usuariosGrupos';
import type { AdminUserRow } from '@/features/admin/services/admin.service';

function usuario(parcial: Partial<AdminUserRow> & { uid: string }): AdminUserRow {
  return {
    name: parcial.uid,
    email: `${parcial.uid}@spot24.com`,
    phone: '',
    role: 'customer',
    createdAtMs: 0,
    ...parcial,
  };
}

describe('esPersonal (5.163)', () => {
  it('el customer NO es personal', () => {
    expect(esPersonal({ role: 'customer' })).toBe(false);
  });

  it('cajero, delivery, gerente y admin SÍ son personal', () => {
    expect(esPersonal({ role: 'cajero' })).toBe(true);
    expect(esPersonal({ role: 'delivery' })).toBe(true);
    expect(esPersonal({ role: 'gerente' })).toBe(true);
    expect(esPersonal({ role: 'admin' })).toBe(true);
  });
});

describe('separarUsuarios (5.163)', () => {
  const MIXTO = [
    usuario({ uid: 'cli-1', role: 'customer', name: 'Ana' }),
    usuario({ uid: 'caj-1', role: 'cajero', name: 'Bruno' }),
    usuario({ uid: 'cli-2', role: 'customer', name: 'Carla' }),
    usuario({ uid: 'adm-1', role: 'admin', name: 'Dueño' }),
    usuario({ uid: 'del-1', role: 'delivery', name: 'Dani' }),
    usuario({ uid: 'ger-1', role: 'gerente', name: 'Gaby' }),
  ];

  it('el personal (cajero, delivery, gerente, admin) queda en SU grupo', () => {
    const g = separarUsuarios(MIXTO);
    expect(g.personal.map((u) => u.uid)).toEqual(['caj-1', 'adm-1', 'del-1', 'ger-1']);
  });

  it('los clientes quedan en SU grupo, en el orden recibido', () => {
    const g = separarUsuarios(MIXTO);
    expect(g.clientes.map((u) => u.uid)).toEqual(['cli-1', 'cli-2']);
  });

  it('la suma de ambos grupos es SIEMPRE el total (nadie se pierde ni se repite)', () => {
    const g = separarUsuarios(MIXTO);
    expect(g.personal.length + g.clientes.length).toBe(MIXTO.length);
  });

  it('lista vacía → ambos grupos vacíos (conteo 0 en cada título)', () => {
    const g = separarUsuarios([]);
    expect(g.personal).toEqual([]);
    expect(g.clientes).toEqual([]);
  });

  it('solo clientes → personal en 0 y clientes con todos', () => {
    const g = separarUsuarios(MIXTO.filter((u) => u.role === 'customer'));
    expect(g.personal).toHaveLength(0);
    expect(g.clientes).toHaveLength(2);
  });

  it('no muta la lista original (el orden de la página no se toca)', () => {
    const copia = [...MIXTO];
    separarUsuarios(MIXTO);
    expect(MIXTO.map((u) => u.uid)).toEqual(copia.map((u) => u.uid));
  });
});
