import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Button } from '@/shared/components/ui/Button';
import { SpeedDivider, SpeedLines } from '@/shared/components/brand/Logo';
import { useAuth } from '../hooks/useAuth';
import { enableOrderNotifications, hasRegisteredToken } from '@/features/delivery/services/notifications.service';
import { normalizePhoneVE } from '@/shared/lib/validation';

/**
 * Cuenta: datos del perfil, notificaciones push y cierre de sesión.
 *
 * Ronda 4 — DECISIÓN DE PRODUCTO: la verificación por SMS se retira del
 * flujo del cliente. La cuota de ~10 SMS/día del plan gratuito de Firebase
 * no escala con el volumen esperado (a partir del usuario 11 del día la
 * verificación se bloquea) y migrar a plan de pago queda fuera del alcance
 * comercial. El teléfono sigue siendo un dato obligatorio y validado por
 * formato en el registro; su confirmación real pasa a ser OPERATIVA: el
 * equipo contacta por llamada/WhatsApp al coordinar la entrega (práctica
 * estándar del comercio venezolano), el antifraude del backend (fraud.ts)
 * sigue evaluando cada pedido y el pago móvil lo valida el personal.
 *
 * El servicio de verificación queda DORMIDO pero completo en
 * auth.service.ts (startPhoneVerification): si el proyecto migra a un plan
 * con SMS, basta con devolver el botón y el modal a esta página.
 */

/** Etiqueta del panel según rol (fallback para roles futuros). */
const PANEL_TITLES: Record<string, string> = {
  admin: 'Panel de administración',
  gerente: 'Panel de gerencia',
  cajero: 'Panel de caja — verificación de pagos',
  delivery: 'Panel de despacho — rutas y entregas',
};

export default function AccountPage() {
  useDocumentTitle('Mi cuenta');
  const { user, signOut, isStaff } = useAuth();
  const navigate = useNavigate();
  const [pushState, setPushState] = useState<'unknown' | 'on' | 'off'>('unknown');

  useEffect(() => {
    if (!user) return;
    void hasRegisteredToken(user.uid).then((on) => setPushState(on ? 'on' : 'off'));
  }, [user]);

  if (!user) return null;

  return (
    <div className="spot-container py-8">
      <SpeedLines className="mb-6" />
      <h1 className="spot-title">Mi cuenta</h1>

      {/* PANEL INTERNO (personal: admin/gerente/cajero/delivery) — ronda 5i-i.
          Entrada visible también en móvil: el enlace «Panel» del TopBar solo
          existe en escritorio (≥sm) y aquí nadie debía adivinar la URL /admin. */}
      {isStaff && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-brand-lg border-2 border-signal bg-surface-2 p-6">
          <div>
            <h2 className="font-display text-lg font-bold italic uppercase text-paper">
              {PANEL_TITLES[user.role] ?? 'Panel interno'}
            </h2>
            <p className="mt-1 text-sm text-muted">
              Tu cuenta tiene acceso al panel operativo. Los datos se cargan al abrir la sección.
            </p>
          </div>
          <Button onClick={() => navigate('/admin')}>Abrir panel</Button>
        </div>
      )}

      <div className="mt-8 grid gap-6 md:grid-cols-2">
        {/* DATOS */}
        <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          <h2 className="font-display text-lg font-bold italic uppercase text-paper">Datos</h2>
          <dl className="mt-4 space-y-3">
            <div>
              <dt className="spot-label">Nombre</dt>
              <dd className="text-paper">{user.name || '—'}</dd>
            </div>
            <div>
              <dt className="spot-label">Correo</dt>
              <dd className="text-paper">{user.email ?? '—'}</dd>
            </div>
            <div>
              <dt className="spot-label">Teléfono</dt>
              {/* Siempre formato local (04243036024): el +58 es interno, nunca se muestra. */}
              <dd className="text-paper">{user.phone ? normalizePhoneVE(user.phone) : '—'}</dd>
            </div>
          </dl>
          <p className="mt-4 text-sm text-muted">
            Coordinamos la entrega por llamada o WhatsApp al número de tu pedido.
            Si cambias de número, actualízalo al registrar tu próxima compra.
          </p>
        </section>

        {/* SESIÓN Y NOTIFICACIONES */}
        <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          <h2 className="font-display text-lg font-bold italic uppercase text-paper">
            Notificaciones y sesión
          </h2>
          <p className="mt-3 text-body-base text-muted">
            Te avisamos por push en cada cambio de tu pedido: pagado, preparado, en camino.
          </p>
          <Button
            className="mt-4"
            variant={pushState === 'on' ? 'secondary' : 'primary'}
            onClick={async () => {
              if (!user) return;
              if (pushState === 'on') return;
              const ok = await enableOrderNotifications(user.uid);
              setPushState(ok ? 'on' : 'off');
            }}
          >
            {pushState === 'on' ? 'Notificaciones activas' : 'Activar notificaciones'}
          </Button>
          <SpeedDivider className="my-5" />
          <Button
            variant="danger-ghost"
            onClick={async () => {
              await signOut();
              navigate('/');
            }}
          >
            Cerrar sesión
          </Button>
        </section>
      </div>
    </div>
  );
}