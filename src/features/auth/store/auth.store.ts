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
  signUp: (
    name: string,
    email: string,
    password: string,
    phoneE164: string,
    cedula: string,
    address: string,
  ) => Promise<SpotUser>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  /** Datos de entrega (5.92g): guarda teléfono + dirección del propio
   *  usuario y parchea el store con los valores sanitizados (sin relectura
   *  Firestore). La cédula ya no se edita aquí (decisión del dueño): la del
   *  registro sigue prellenando cada compra en el checkout. */
  saveMyData: (phone: string, address: string) => Promise<void>;
  /** Cambio de contraseña en sesión (5.75). */
  changeMyPassword: (currentPassword: string, newPassword: string) => Promise<void>;
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

  signUp: async (name, email, password, phoneE164, cedula, address) => {
    const user = await authService.signUpEmail(name, email, password, phoneE164, cedula, address);
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

  saveMyData: async (phone, address) => {
    const clean = await authService.saveCustomerData(phone, address);
    set((s) => (s.user ? { user: { ...s.user, ...clean } } : {}));
  },

  changeMyPassword: async (currentPassword, newPassword) => {
    await authService.changePassword(currentPassword, newPassword);
  },

  setUser: (u) => set({ user: u, ready: true }),
}));