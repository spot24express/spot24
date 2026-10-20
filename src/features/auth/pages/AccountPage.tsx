import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Button } from '@/shared/components/ui/Button';
import { Input, Textarea } from '@/shared/components/ui/Input';
import { SpeedDivider, SpeedLines } from '@/shared/components/brand/Logo';
import { toast } from '@/shared/lib/toast';
import { userMessage } from '@/shared/lib/errors';
import { useAuth } from '../hooks/useAuth';
import {
  enableOrderNotifications,
  hasRegisteredToken,
  isPushSupported,
} from '@/features/delivery/services/notifications.service';
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
 *
 * Ronda 5.27 — Sin botón muerto: si el navegador no soporta push (iPhone
 * sin PWA instalada — Safari 16.4 solo permite push a PWAS instaladas — o
 * navegador viejo sin PushManager), el botón se OCULTA y se muestra una
 * nota breve con el camino real (instalar la PWA y volver). Sin VAPID
 * configurada también cae aquí: nada que el cliente pueda activar a la
 * fuerza. Decisión de producto: NO existe «Desactivar» (el push solo
 * informa el estado del pedido; bloquear desde el navegador basta y el
 * token muerto se limpia solo en el siguiente envío).
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
  const { user, signOut, isStaff, saveMyData, changeMyPassword } = useAuth();
  const navigate = useNavigate();
  const [pushState, setPushState] = useState<'unknown' | 'on' | 'off'>('unknown');
  // null = comprobando soporte (el botón se pinta igual: comportamiento de siempre).
  const [supported, setSupported] = useState<boolean | null>(null);

  // 5.75 · «Mis datos»: cédula + dirección del perfil, editables aquí.
  const [data, setData] = useState({ cedula: '', address: '' });
  const [dataErrors, setDataErrors] = useState<Record<string, string | null>>({});
  const [savingData, setSavingData] = useState(false);
  // 5.75 · Cambio de contraseña en sesión.
  const [pw, setPw] = useState({ current: '', next: '', confirm: '' });
  const [pwErrors, setPwErrors] = useState<Record<string, string | null>>({});
  const [savingPw, setSavingPw] = useState(false);

  // Al llegar/refrescar el perfil, el formulario muestra lo guardado.
  // Tras guardar, el store se parchea con los valores sanitizados: el
  // formulario queda exactamente con lo que quedó escrito en Firestore.
  useEffect(() => {
    if (user) setData({ cedula: user.cedula ?? '', address: user.address ?? '' });
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    void (async () => {
      if (!(await isPushSupported())) {
        if (!cancelled) setSupported(false);
        return;
      }
      if (cancelled) return;
      setSupported(true);
      const on = await hasRegisteredToken(user.uid);
      if (!cancelled) setPushState(on ? 'on' : 'off');
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  /** Guarda cédula + dirección (validación idéntica al registro y al servicio). */
  const onSaveData = async () => {
    const e: Record<string, string | null> = {};
    const ced = data.cedula.replace(/\D/g, '');
    if (ced.length < 4 || ced.length > 8) e['cedula'] = 'Cédula: solo números (4 a 8 dígitos).';
    if (data.address.trim().length < 8) e['address'] = 'Dirección: urbanización, calle y casa o apartamento.';
    setDataErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setSavingData(true);
    try {
      await saveMyData(data.cedula, data.address);
      toast.success('Datos guardados. Tu próxima compra va prellenada.');
    } catch (err) {
      toast.error(userMessage(err));
    } finally {
      setSavingData(false);
    }
  };

  /** Cambio de contraseña: valida aquí y delega el resto al servicio. */
  const onChangePw = async () => {
    const e: Record<string, string | null> = {};
    if (pw.current.length < 6) e['current'] = 'Escribe tu contraseña actual.';
    if (pw.next.length < 6) e['next'] = 'La nueva necesita al menos 6 caracteres.';
    else if (pw.next === pw.current) e['next'] = 'La nueva debe ser distinta de la actual.';
    if (pw.next !== pw.confirm) e['confirm'] = 'No coincide con la nueva contraseña.';
    setPwErrors(e);
    if (Object.values(e).some(Boolean)) return;
    setSavingPw(true);
    try {
      await changeMyPassword(pw.current, pw.next);
      toast.success('Contraseña actualizada. Úsala la próxima vez que entres.');
      setPw({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast.error(userMessage(err));
    } finally {
      setSavingPw(false);
    }
  };

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

        {/* MIS DATOS DE ENTREGA (5.75): cédula + dirección editables. Lo que
            se guarda aquí prellena el checkout (contacto, dirección y la
            «Cédula del pagador» del pago móvil). */}
        <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          <h2 className="font-display text-lg font-bold italic uppercase text-paper">
            Mis datos de entrega
          </h2>
          <p className="mt-1 text-sm text-muted">
            Van prellenados en cada compra. Corrígelos aquí si cambiaron.
          </p>
          <div className="mt-4 grid gap-4">
            <Input
              label="Cédula"
              inputMode="numeric"
              autoComplete="off"
              placeholder="12345678"
              value={data.cedula}
              onChange={(e) => setData((d) => ({ ...d, cedula: e.target.value.replace(/\D/g, '').slice(0, 8) }))}
              error={dataErrors['cedula']}
              hint="Solo números, 4 a 8 dígitos."
            />
            <Textarea
              label="Dirección completa"
              rows={2}
              autoComplete="street-address"
              placeholder="Urb. Los Taladros, Av. Principal, Casa 24, Piso 1"
              value={data.address}
              onChange={(e) => setData((d) => ({ ...d, address: e.target.value }))}
              error={dataErrors['address']}
              hint="Urbanización, calle y casa o apartamento."
            />
            <Button loading={savingData} onClick={() => void onSaveData()} className="justify-self-start">
              Guardar mis datos
            </Button>
          </div>
        </section>

        {/* SEGURIDAD (5.75): cambio de contraseña sin correos ni esperas.
            Firebase exige re-autenticar con la clave actual: el servicio lo
            resuelve y traduce cada error a un mensaje claro. */}
        <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          <h2 className="font-display text-lg font-bold italic uppercase text-paper">Seguridad</h2>
          <p className="mt-1 text-sm text-muted">
            Cambia tu contraseña cuando quieras. Te pedimos la actual por seguridad.
          </p>
          {/* Form nativo: silencia el aviso del navegador «Password field is
              not contained in a form» y habilita Enter para enviar. */}
          <form
            className="mt-4 grid gap-4"
            onSubmit={(e) => {
              e.preventDefault();
              void onChangePw();
            }}
          >
            {/* Username oculto: el navegador lo exige en forms de contraseña
                (aviso «Password forms should have username fields»). */}
            <input
              type="text"
              hidden
              readOnly
              aria-hidden="true"
              autoComplete="username"
              value={user?.email ?? ''}
              onChange={() => undefined}
            />
            <Input
              label="Contraseña actual"
              type="password"
              autoComplete="current-password"
              value={pw.current}
              onChange={(e) => setPw((p) => ({ ...p, current: e.target.value }))}
              error={pwErrors['current']}
            />
            <Input
              label="Nueva contraseña"
              type="password"
              autoComplete="new-password"
              value={pw.next}
              onChange={(e) => setPw((p) => ({ ...p, next: e.target.value }))}
              error={pwErrors['next']}
              hint="Mínimo 6 caracteres."
            />
            <Input
              label="Repetir nueva contraseña"
              type="password"
              autoComplete="new-password"
              value={pw.confirm}
              onChange={(e) => setPw((p) => ({ ...p, confirm: e.target.value }))}
              error={pwErrors['confirm']}
            />
            <Button type="submit" loading={savingPw} className="justify-self-start">
              Cambiar contraseña
            </Button>
          </form>
        </section>

        {/* SESIÓN Y NOTIFICACIONES */}
        <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          <h2 className="font-display text-lg font-bold italic uppercase text-paper">
            Notificaciones y sesión
          </h2>
          <p className="mt-3 text-body-base text-muted">
            Te avisamos por push en cada cambio de tu pedido: pagado, preparado, en camino.
          </p>
          {supported === false ? (
            <p className="mt-4 text-sm text-muted">
              Este navegador no permite notificaciones push. En iPhone: abre SPOT 24 en Safari, toca
              Compartir y «Añadir a pantalla de inicio»; luego activa las notificaciones desde aquí.
            </p>
          ) : (
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
          )}
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