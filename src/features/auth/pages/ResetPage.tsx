import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { useAuth } from '../hooks/useAuth';
import { isValidEmail } from '@/shared/lib/validation';

/** Recuperación de contraseña (5.3): respuesta neutra anti-enumeración. */
export default function ResetPage() {
  useDocumentTitle('Recuperar clave');
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!isValidEmail(email)) return;
    setLoading(true);
    try {
      await resetPassword(email);
    } finally {
      setLoading(false);
      setSent(true);
    }
  };

  return (
    <div className="spot-container flex min-h-[70dvh] items-center justify-center py-10">
      <div className="w-full max-w-md rounded-brand-lg border-2 border-line bg-surface-1 p-8">
        <SpeedLines className="mb-6" />
        <h1 className="font-display text-2xl font-extrabold italic uppercase text-paper">
          Recuperar clave
        </h1>
        {sent ? (
          <div className="mt-4 space-y-4">
            <p className="text-body-base text-paper">
              Si el correo está registrado, te enviamos un enlace para crear una clave nueva.
              Revisa tu bandeja y la carpeta de spam.
            </p>
            <Link to="/cuenta/login">
              <Button variant="secondary" fullWidth>
                Volver a entrar
              </Button>
            </Link>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
            <Input
              label="Correo electrónico"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <Button type="submit" size="lg" fullWidth loading={loading}>
              Enviar enlace
            </Button>
            <p className="text-center">
              <Link to="/cuenta/login" className="spot-label hover:text-signal">
                Volver
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
