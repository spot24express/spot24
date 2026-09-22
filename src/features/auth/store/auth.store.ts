/**
 * Módulo auth · Store global de sesión (zustand).
 * Al cambiar la sesión: fusión del carrito y sincronización de estado UI.
 */
import { create } from 'zustand';
import * as authService from '../services/auth.service';
import type { SpotUser } from '../types';

interface AuthState {
  user: SpotUser | null;
  ready: boolean;
  /** true cuando el perfil tiene claim admin. */
  isAdmin: () => boolean;
  signIn: (email: string, password: string) => Promise<SpotUser>;
  signUp: (name: string, email: string, password: string, phoneE164: string) => Promise<SpotUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Solo modo demo: sesión local sin Firebase. */
  signInDemo: (role: 'customer' | 'admin') => void;
  setUser: (u: SpotUser | null) => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  ready: false,

  isAdmin: () => get().user?.role === 'admin',

  signIn: async (email, password) => {
    const user = await authService.signInEmail(email, password);
    set({ user });
    return user;
  },

  signUp: async (name, email, password, phoneE164) => {
    const user = await authService.signUpEmail(name, email, password, phoneE164);
    set({ user });
    return user;
  },

  signOut: async () => {
    await authService.signOut();
    set({ user: null });
  },

  resetPassword: async (email) => {
    await authService.sendReset(email);
  },

  signInDemo: (role) => {
    const user = authService.demoSignIn(role);
    set({ user });
  },

  setUser: (u) => set({ user: u, ready: true }),
}));
