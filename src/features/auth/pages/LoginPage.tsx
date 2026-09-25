import { useState, type FormEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { useAuth } from '../hooks/useAuth';
import { userMessage } from '@/shared/lib/errors';
import { isValidEmail } from '@/shared/lib/validation';
import { DEMO_MODE } from '@/shared/lib/backend';
import { useAuthStore } from '../store/auth.store';

/** Inicio de sesión: correo/contraseña (5.3). */
export default function LoginPage() {
  useDocumentTitle('Entrar');
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isValidEmail(email) || password.length < 6) {
      setError('Revisa tu correo y tu clave (mínimo 6 caracteres).');
      return;
    }
    setLoading(true);
    try {
      await signIn(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-[75dvh] items-center justify-center overflow-hidden py-10">
      {/* Fondo: la insignia SPOT 24 pintada en el asfalto */}
      <img
        src="/img/local-insignia.jpg"
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
      />
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-ink via-ink/75 to-ink/55"
      />

      <div className="spot-container relative flex justify-center">
      <div className="w-full max-w-md rounded-brand-lg border-2 border-line bg-surface-1/95 p-8 backdrop-blur">
        <SpeedLines className="mb-6" />
        <h1 className="font-display text-2xl font-extrabold italic uppercase text-paper">Entrar</h1>
        <p className="mt-1 text-muted">Para. Resuelve. Sigue.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <Input
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            error={error}
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          <div className="flex justify-end">
            <Link to="/cuenta/recuperar" className="spot-label hover:text-signal">
              Olvidé mi clave
            </Link>
          </div>
          <Button type="submit" size="lg" fullWidth loading={loading}>
            Entrar
          </Button>
        </form>

        {DEMO_MODE && (
          <div className="mt-6 rounded-brand border-2 border-dashed border-signal/50 bg-signal/5 p-4">
            <p className="spot-label mb-2 text-signal">Modo demo activo</p>
            <p className="text-sm text-muted">
              Sin Firebase configurado puedes explorar todo con una sesión local.
            </p>
            <div className="mt-3 flex flex-col gap-2">
              <Button
                variant="secondary"
                onClick={() => {
                  useAuthStore.getState().signInDemo('customer');
                  navigate('/checkout');
                }}
              >
                Entrar como cliente (demo)
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  useAuthStore.getState().signInDemo('admin');
                  navigate('/admin');
                }}
              >
                Entrar como admin (demo)
              </Button>
            </div>
          </div>
        )}

        <p className="mt-6 text-center text-body-base text-muted">
          ¿Primera vez?{' '}
          <Link to="/cuenta/registro" className="font-semibold text-signal hover:underline">
            Crea tu cuenta
          </Link>
        </p>
      </div>
      </div>
    </div>
  );
}