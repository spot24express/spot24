import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Button } from '@/shared/components/ui/Button';
import { SpeedDivider, SpeedLines } from '@/shared/components/brand/Logo';
import { Modal } from '@/shared/components/ui/Modal';
import { useAuth } from '../hooks/useAuth';
import { startPhoneVerification } from '../services/auth.service';
import { enableOrderNotifications, hasRegisteredToken } from '@/features/delivery/services/notifications.service';
import { userMessage } from '@/shared/lib/errors';
import { isValidPhoneVE, normalizePhoneVE } from '@/shared/lib/validation';
import type { ConfirmationResult } from 'firebase/auth';
import { DEMO_MODE } from '@/shared/lib/backend';

/** Cuenta: datos, teléfono verificado, notificaciones y cierre de sesión. */
export default function AccountPage() {
  useDocumentTitle('Mi cuenta');
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [pushState, setPushState] = useState<'unknown' | 'on' | 'off'>('unknown');

  useEffect(() => {
    if (!user || DEMO_MODE) {
      setPushState(DEMO_MODE ? 'off' : 'unknown');
      return;
    }
    void hasRegisteredToken(user.uid).then((on) => setPushState(on ? 'on' : 'off'));
  }, [user]);

  if (!user) return null;

  return (
    <div className="spot-container py-8">
      <SpeedLines className="mb-6" />
      <h1 className="spot-title">Mi cuenta</h1>

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
              <dd className="text-paper">{user.phone ?? 'Sin verificar'}</dd>
            </div>
          </dl>
          {!DEMO_MODE && (
            <Button variant="secondary" className="mt-5" onClick={() => setPhoneOpen(true)}>
              Verificar teléfono
            </Button>
          )}
        </section>

        {/* SESIÓN Y NOTIFICACIONES */}
        <section className="rounded-brand-lg border-2 border-line bg-surface-1 p-6">
          <h2 className="font-display text-lg font-bold italic uppercase text-paper">
            Notificaciones y sesión
          </h2>
          <p className="mt-3 text-body-base text-muted">
            Te avisamos por push en cada cambio de tu pedido: pagado, preparado, en camino.
          </p>
          {!DEMO_MODE && (
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
          {DEMO_MODE && (
            <p className="mt-4 rounded-brand border-2 border-signal/40 bg-signal/5 p-3 text-sm text-paper">
              Modo demo: sesión y notificaciones requieren Firebase configurado.
            </p>
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

      <PhoneVerifyModal open={phoneOpen} onClose={() => setPhoneOpen(false)} />
    </div>
  );
}

/** Verificación por teléfono con Recaptcha invisible + código SMS (5.3). */
function PhoneVerifyModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const send = async () => {
    setError(null);
    if (!isValidPhoneVE(phone)) {
      setError('Teléfono inválido. Ej.: 04141234567');
      return;
    }
    setBusy(true);
    try {
      const normalized = normalizePhoneVE(phone);
      const e164 = `+58${normalized.startsWith('0') ? normalized.slice(1) : normalized}`;
      const result = await startPhoneVerification('spot-recaptcha', e164);
      setConfirmation(result);
    } catch (e) {
      setError(userMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!confirmation) return;
    setBusy(true);
    setError(null);
    try {
      await confirmation.confirm(code);
      onClose();
      window.location.reload();
    } catch {
      setError('Código incorrecto. Revisa e intenta de nuevo.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Verificar teléfono">
      <div id="spot-recaptcha" />
      {!confirmation ? (
        <div className="space-y-4">
          <p className="text-body-base text-muted">
            Enviaremos un SMS con un código de 6 dígitos.
          </p>
          <input
            aria-label="Teléfono"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="04141234567"
            className="w-full rounded-brand border-2 border-line bg-surface-1 px-4 py-3 text-paper focus:border-signal focus:outline-none"
          />
          {error && <p role="alert" className="text-sm font-semibold text-signal">{error}</p>}
          <Button fullWidth loading={busy} onClick={() => void send()}>
            Enviar código
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <input
            aria-label="Código SMS"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            inputMode="numeric"
            placeholder="000000"
            className="w-full rounded-brand border-2 border-line bg-surface-1 px-4 py-3 text-center font-display text-2xl font-bold italic tracking-[0.4em] text-paper focus:border-signal focus:outline-none"
          />
          {error && <p role="alert" className="text-sm font-semibold text-signal">{error}</p>}
          <Button fullWidth loading={busy} onClick={() => void verify()}>
            Verificar
          </Button>
        </div>
      )}
    </Modal>
  );
}
