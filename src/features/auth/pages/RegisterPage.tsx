import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDocumentTitle } from '@/shared/hooks/useDocumentTitle';
import { Input } from '@/shared/components/ui/Input';
import { Button } from '@/shared/components/ui/Button';
import { SpeedLines } from '@/shared/components/brand/Logo';
import { useAuth } from '../hooks/useAuth';
import { userMessage } from '@/shared/lib/errors';
import {
  isValidEmail, isValidPersonName, isValidPhoneVE, normalizePhoneVE,
} from '@/shared/lib/validation';

/**
 * Registro: nombre, correo, teléfono venezolano y clave (5.3).
 * La verificación por teléfono se ofrece desde Cuenta.
 */
export default function RegisterPage() {
  useDocumentTitle('Crear cuenta');
  const navigate = useNavigate();
  const { signUp } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '' });
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [loading, setLoading] = useState(false);

  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const validate = (): boolean => {
    const e: Record<string, string | null> = {};
    if (!isValidPersonName(form.name)) e['name'] = 'Escribe tu nombre y apellido.';
    if (!isValidEmail(form.email)) e['email'] = 'Correo no válido.';
    if (!isValidPhoneVE(form.phone)) e['phone'] = 'Teléfono móvil venezolano: 04141234567.';
    if (form.password.length < 6) e['password'] = 'Mínimo 6 caracteres.';
    setErrors(e);
    return Object.values(e).every((x) => !x);
  };

  const onSubmit = async (ev: FormEvent) => {
    ev.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      const phone = normalizePhoneVE(form.phone);
      const e164 = `+58${phone.startsWith('0') ? phone.slice(1) : phone}`;
      await signUp(form.name, form.email, form.password, e164);
      navigate('/', { replace: true });
    } catch (err) {
      setErrors({ email: userMessage(err) });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="spot-container flex min-h-[70dvh] items-center justify-center py-10">
      <div className="w-full max-w-md rounded-brand-lg border-2 border-line bg-surface-1 p-8">
        <SpeedLines className="mb-6" />
        <h1 className="font-display text-2xl font-extrabold italic uppercase text-paper">Crear cuenta</h1>
        <p className="mt-1 text-muted">Un minuto y estás rodando.</p>

        <form className="mt-6 space-y-4" onSubmit={onSubmit} noValidate>
          <Input
            label="Nombre y apellido"
            autoComplete="name"
            value={form.name}
            onChange={(e) => set('name')(e.target.value)}
            error={errors['name']}
            required
          />
          <Input
            label="Correo electrónico"
            type="email"
            autoComplete="email"
            value={form.email}
            onChange={(e) => set('email')(e.target.value)}
            error={errors['email']}
            required
          />
          <Input
            label="Teléfono móvil"
            type="tel"
            inputMode="tel"
            autoComplete="tel-national"
            placeholder="04141234567"
            value={form.phone}
            onChange={(e) => set('phone')(e.target.value)}
            error={errors['phone']}
            hint="Lo usamos solo para coordinar tu entrega."
            required
          />
          <Input
            label="Contraseña"
            type="password"
            autoComplete="new-password"
            value={form.password}
            onChange={(e) => set('password')(e.target.value)}
            error={errors['password']}
            minLength={6}
            required
          />
          <Button type="submit" size="lg" fullWidth loading={loading}>
            Crear cuenta
          </Button>
        </form>

        <p className="mt-6 text-center text-body-base text-muted">
          ¿Ya tienes cuenta?{' '}
          <Link to="/cuenta/login" className="font-semibold text-signal hover:underline">
            Entra
          </Link>
        </p>
      </div>
    </div>
  );
}
