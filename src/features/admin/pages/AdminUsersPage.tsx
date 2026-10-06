import { useEffect, useMemo, useState } from 'react';
import { toast } from '@/shared/lib/toast';
import { ListSkeleton } from '@/shared/components/ui/Skeleton';
import { ErrorState } from '@/shared/components/ui/States';
import { Button } from '@/shared/components/ui/Button';
import { Chip } from '@/shared/components/ui/Badge';
import { Input, Select } from '@/shared/components/ui/Input';
import { Modal } from '@/shared/components/ui/Modal';
import { adminListUsers, type AdminUserRow } from '../services/admin.service';
import { callFunction } from '@/shared/lib/backend';
import { userMessage } from '@/shared/lib/errors';
import { useAuth } from '@/features/auth/hooks/useAuth';

type Role = AdminUserRow['role'];

const ROLE_LABELS: Record<Role, string> = {
  customer: 'Cliente',
  cajero: 'Cajero/a',
  delivery: 'Delivery',
  gerente: 'Gerente',
  admin: 'Admin',
};

/**
 * Gestión de personas: cambiar rol (Cliente / Delivery / Admin) y cerrar todas
 * las sesiones de una cuenta. Los roles los escribe el SERVIDOR (custom
 * claims); quien cambia de rol debe cerrar sesión y volver a entrar.
 */
export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [roleTarget, setRoleTarget] = useState<{ user: AdminUserRow; role: Role } | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    setLoading(true);
    void adminListUsers()
      .then((u) => {
        setUsers(u);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return users;
    return users.filter((u) => `${u.name} ${u.email} ${u.phone}`.toLowerCase().includes(t));
  }, [users, search]);

  /** Ronda 3: el gerente VE la lista pero NO cambia roles ni cierra sesiones
   *  (el backend lo rechaza: fn-setUserRole/fn-revokeUserSessions son admin). */
  const canManage = useAuth().user?.role === 'admin';

  const applyRole = async () => {
    if (!roleTarget) return;
    setBusy(true);
    try {
      await callFunction<{ ok: boolean }>('fn-setUserRole', { uid: roleTarget.user.uid, role: roleTarget.role });
      toast.success(`Rol actualizado a ${ROLE_LABELS[roleTarget.role]}. La persona debe cerrar sesión y volver a entrar para cargarlo.`);
      setRoleTarget(null);
      load();
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async () => {
    if (!revokeTarget) return;
    setBusy(true);
    try {
      await callFunction<{ ok: boolean }>('fn-revokeUserSessions', { uid: revokeTarget.uid });
      toast.success('Sesiones cerradas. La persona deberá volver a iniciar sesión.');
      setRevokeTarget(null);
    } catch (e) {
      toast.error(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-display text-xl font-bold italic uppercase text-paper">Usuarios</h2>
          <p className="spot-subtitle mt-1">Clientes, cajeros, deliverys, gerentes y admins. Roles y sesiones desde aquí.</p>
        </div>
      </div>

      <Input
        label="Buscar por nombre, correo o teléfono"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="max-w-md"
      />

      <div className="mt-6">
        {error ? (
          <ErrorState onRetry={load} />
        ) : loading ? (
          <ListSkeleton rows={4} />
        ) : filtered.length === 0 ? (
          <p className="rounded-brand-lg border-2 border-dashed border-line bg-surface-1 p-6 text-muted">
            {search ? 'Nadie coincide con esa búsqueda.' : 'Aún no hay usuarios registrados.'}
          </p>
        ) : (
          <ul className="space-y-3">
            {filtered.map((u) => (
              <li key={u.uid} className="flex flex-wrap items-center justify-between gap-4 rounded-brand-lg border-2 border-line bg-surface-1 p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="truncate font-semibold text-paper">{u.name || '(sin nombre)'}</p>
                    <Chip active={u.role === 'admin'} aria-label={u.role}>
                      {ROLE_LABELS[u.role]}
                    </Chip>
                  </div>
                  <p className="spot-label mt-0.5 truncate">
                    {u.email}{u.phone ? ` · ${u.phone}` : ''}
                    {u.createdAtMs ? ` · desde ${new Date(u.createdAtMs).toLocaleDateString('es-VE')}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {canManage ? (
                    <>
                      <Select
                        label=""
                        value={u.role}
                        aria-label={`Rol de ${u.name || u.email}`}
                        onChange={(e) => {
                          const role = e.target.value as Role;
                          if (role !== u.role) setRoleTarget({ user: u, role });
                        }}
                        className="sm:w-40"
                      >
                        <option value="customer">Cliente</option>
                        <option value="cajero">Cajero/a</option>
                        <option value="delivery">Delivery</option>
                        <option value="gerente">Gerente</option>
                        <option value="admin">Admin</option>
                      </Select>
                      <Button variant="secondary" size="sm" onClick={() => setRevokeTarget(u)}>
                        Cerrar sesiones
                      </Button>
                    </>
                  ) : (
                    <span className="spot-label">Solo lectura</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-6 rounded-brand border-2 border-dashed border-line bg-surface-1 p-4 text-sm text-muted">
        {canManage ? (
          <>
            Al cambiar el rol, la persona debe <strong className="text-paper">cerrar sesión y volver a entrar</strong> para
            que el nuevo rol le cargue. «Cerrar sesiones» la expulsa de todos sus dispositivos de inmediato.
          </>
        ) : (
          <>
            Vista de gerencia: puedes consultar el directorio. Los cambios de rol y el cierre de
            sesiones son exclusivos del admin.
          </>
        )}
      </p>

      {/* Confirmación de cambio de rol */}
      <Modal open={roleTarget !== null} onClose={() => setRoleTarget(null)} title="Cambiar rol">
        {roleTarget && (
          <div className="space-y-4">
            <p className="text-body-base text-paper">
              ¿Poner a <strong>{roleTarget.user.name || roleTarget.user.email}</strong> como{' '}
              <strong className="text-signal">{ROLE_LABELS[roleTarget.role]}</strong>?
            </p>
            {roleTarget.role === 'cajero' && (
              <p className="rounded-brand border-2 border-line bg-surface-1 p-3 text-sm text-paper">
                Una persona cajera confirma pagos por Pago Móvil y prepara pedidos. No gestiona
                catálogo, zonas ni usuarios.
              </p>
            )}
            {roleTarget.role === 'delivery' && (
              <p className="rounded-brand border-2 border-line bg-surface-1 p-3 text-sm text-paper">
                Una persona delivery ve los pedidos preparados, los lleva y los marca en ruta y
                entregados. No ve pagos ni catálogo.
              </p>
            )}
            {roleTarget.role === 'gerente' && (
              <p className="rounded-brand border-2 border-line bg-surface-1 p-3 text-sm text-paper">
                Gerencia: verifica pagos, mueve pedidos en todo el flujo, gestiona catálogo y
                promos (sin borrar) y consulta métricas y usuarios. No cambia roles ni ajustes
                de pago (eso queda en el admin).
              </p>
            )}
            {roleTarget.role === 'admin' && (
              <p className="rounded-brand border-2 border-signal/40 bg-signal/5 p-3 text-sm text-paper">
                Ojo: un admin puede entrar al panel, gestionar catálogo, zonas, pagos y otros
                usuarios. Asígnalo solo a personas de tu confianza.
              </p>
            )}
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setRoleTarget(null)}>Cancelar</Button>
              <Button className="flex-1" loading={busy} onClick={() => void applyRole()}>
                Confirmar rol
              </Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Confirmación de cierre de sesiones */}
      <Modal open={revokeTarget !== null} onClose={() => setRevokeTarget(null)} title="Cerrar sesiones">
        {revokeTarget && (
          <div className="space-y-4">
            <p className="text-body-base text-paper">
              ¿Cerrar todas las sesiones de <strong>{revokeTarget.name || revokeTarget.email}</strong>?
              Tendrá que iniciar sesión de nuevo en cada dispositivo.
            </p>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={() => setRevokeTarget(null)}>Cancelar</Button>
              <Button className="flex-1" loading={busy} onClick={() => void revoke()}>
                Cerrar sesiones
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}