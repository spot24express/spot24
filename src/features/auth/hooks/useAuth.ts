/** Hooks públicos del módulo auth. */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { observeAuth } from '../services/auth.service';
import { useCartStore } from '@/features/cart/store/cart.store';

/** Monta el observador de sesión una vez (en Providers). */
export function useAuthObserver(): void {
  const setUser = useAuthStore((s) => s.setUser);
  useEffect(() => {
    const unsub = observeAuth(async (user) => {
      setUser(user);
      const cart = useCartStore.getState();
      if (!cart.hydrated) {
        await cart.hydrateForUser(user?.uid ?? null);
        cart.setHydrated();
      }
    });
    return unsub;
  }, [setUser]);
}

export function useAuth() {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const signOut = useAuthStore((s) => s.signOut);
  const resetPassword = useAuthStore((s) => s.resetPassword);
  return {
    user,
    ready,
    isAuthenticated: user !== null,
    isAdmin: user?.role === 'admin',
    signIn,
    signUp,
    signOut,
    resetPassword,
  };
}

/** Guarda de ruta: exige sesión y redirige a login conservando el destino. */
export function useRequireAuth(): { ready: boolean; authenticated: boolean } {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !user) {
      navigate('/cuenta/login', { replace: true, state: { from: window.location.pathname } });
    }
  }, [ready, user, navigate]);
  return { ready, authenticated: user !== null };
}

/** Guarda de ruta admin: exige claim admin. */
export function useRequireAdmin(): { ready: boolean; isAdmin: boolean } {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !user) {
      navigate('/cuenta/login', { replace: true, state: { from: '/admin' } });
      return;
    }
    if (ready && user && user.role !== 'admin') {
      navigate('/', { replace: true });
    }
  }, [ready, user, navigate]);
  return { ready, isAdmin: user?.role === 'admin' };
}
