/** Hooks públicos del módulo auth. */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/auth.store';
import { observeAuth } from '../services/auth.service';
import { useCartStore } from '@/features/cart/store/cart.store';
import type { UserRole } from '../types';

/** Roles con acceso al panel operativo (única fuente de verdad, ronda 5i-i).
 *  La usa useAuth (isStaff → enlace «Panel» visible) y useRequirePanel (guard). */
const STAFF_PANEL_ROLES: readonly UserRole[] = ['admin', 'gerente', 'cajero', 'delivery'];

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
    /** Personal con panel: admin, gerente, cajero, delivery (entradas visibles). */
    isStaff: user !== null && STAFF_PANEL_ROLES.includes(user.role),
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

/**
 * Guarda del panel (antes "admin"): entran ADMIN, GERENTE, CAJERO y DELIVERY
 * con secciones acotadas por rol (el menú y las rutas filtran el resto).
 * Devuelve el rol con acceso o null si no debe estar en el panel.
 */
export function useRequirePanel(): { ready: boolean; role: UserRole | null } {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (ready && !user) {
      navigate('/cuenta/login', { replace: true, state: { from: '/admin' } });
      return;
    }
    if (ready && user && !STAFF_PANEL_ROLES.includes(user.role)) {
      navigate('/', { replace: true });
    }
  }, [ready, user, navigate]);
  const role: UserRole | null = user && STAFF_PANEL_ROLES.includes(user.role) ? user.role : null;
  return { ready, role };
}