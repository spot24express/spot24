/**
 * Módulo auth · Capa de servicios (Firebase Auth + perfil en Firestore).
 * Roles customer/admin mediante custom claims (5.3). Cierre de sesión remoto
 * por época de sesión en users/{uid}.sessionEpoch.
 */
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut,
  sendPasswordResetEmail, onAuthStateChanged, updateProfile,
  RecaptchaVerifier, signInWithPhoneNumber, type ConfirmationResult, type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { DEMO_MODE } from '@/shared/lib/backend';
import { logger } from '@/shared/lib/logger';
import { AppError } from '@/shared/lib/errors';
import { sanitizeText, isValidEmail } from '@/shared/lib/validation';
import type { SpotUser } from '../types';

/* ── Mensajes de error genéricos: el detalle técnico solo a logs (6.9) ── */
const GENERIC = 'Correo o clave incorrectos. Revisa e intenta de nuevo.';

function mapUser(user: User, extra?: Partial<SpotUser>): SpotUser {
  return {
    uid: user.uid,
    email: user.email,
    phone: user.phoneNumber,
    name: user.displayName ?? '',
    role: 'customer', // el rol real llega por claims en fetchProfile
    emailVerified: user.emailVerified,
    sessionEpoch: 0,
    ...extra,
  };
}

async function fetchProfile(user: User): Promise<SpotUser> {
  const base = mapUser(user);
  const claimsResult = await user.getIdTokenResult().catch(() => null);
  const claimsRole = claimsResult?.claims['role'];
  const fb = await loadFirebase();
  let name = base.name;
  let sessionEpoch = 0;
  if (fb) {
    const snap = await getDoc(doc(fb.db, 'users', user.uid)).catch(() => null);
    if (snap?.exists()) {
      name = String(snap.data()['name'] ?? name);
      sessionEpoch = Number(snap.data()['sessionEpoch'] ?? 0);
    }
  }
  return {
    ...base,
    name,
    sessionEpoch,
    role: claimsRole === 'admin' ? 'admin' : 'customer',
  };
}

/* ───────────────────────────── API pública ───────────────────────────── */

/* ── Sesión demo (solo sin Firebase): permite navegar checkout y admin ── */
const DEMO_SESSION_KEY = 'spot24:demo:session';

export function demoSignIn(role: 'customer' | 'admin'): SpotUser {
  const user: SpotUser = {
    uid: `demo-${role}`,
    email: 'demo@spot24.com.ve',
    phone: null,
    name: role === 'admin' ? 'Admin Demo' : 'Cliente Demo',
    role,
    emailVerified: true,
    sessionEpoch: 0,
  };
  try {
    localStorage.setItem(DEMO_SESSION_KEY, JSON.stringify(user));
  } catch {
    /* almacenamiento no disponible */
  }
  return user;
}

export function demoSignOut(): void {
  try {
    localStorage.removeItem(DEMO_SESSION_KEY);
  } catch {
    /* almacenamiento no disponible */
  }
}

export async function signUpEmail(name: string, email: string, password: string, phoneE164: string): Promise<SpotUser> {
  if (!isValidEmail(email)) throw new AppError('generic', 'email inválido en signUp');
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  try {
    const cred = await createUserWithEmailAndPassword(fb.auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: sanitizeText(name, 80) });
    await setDoc(
      doc(fb.db, 'users', cred.user.uid),
      {
        name: sanitizeText(name, 80),
        email: email.trim().toLowerCase(),
        phoneE164: sanitizeText(phoneE164, 20),
        role: 'customer',
        sessionEpoch: Date.now(),
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
    return mapUser(cred.user, { name: sanitizeText(name, 80), sessionEpoch: Date.now() });
  } catch (e) {
    logger.warn('signUp falló', e);
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('email-already-in-use')) throw new AppError('generic', 'email en uso');
    if (code.includes('weak-password')) throw new AppError('generic', 'clave débil');
    throw new AppError('generic', GENERIC);
  }
}

export async function signInEmail(email: string, password: string): Promise<SpotUser> {
  if (DEMO_MODE) return demoSignIn('customer');
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  try {
    const cred = await signInWithEmailAndPassword(fb.auth, email.trim(), password);
    return await fetchProfile(cred.user);
  } catch (e) {
    logger.warn('signIn falló', e);
    throw new AppError('generic', GENERIC);
  }
}

export async function signOut(): Promise<void> {
  if (DEMO_MODE) {
    demoSignOut();
    return;
  }
  const fb = await loadFirebase();
  if (!fb) return;
  await fbSignOut(fb.auth);
}

export async function sendReset(email: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  try {
    await sendPasswordResetEmail(fb.auth, email.trim());
  } catch (e) {
    logger.warn('reset falló', e);
    // Respuesta neutra: no revelar si el correo existe (enumeración de usuarios).
  }
}

/** Recaptcha invisible para teléfono (contenedor en la página de cuenta). */
export async function buildRecaptcha(containerId: string): Promise<RecaptchaVerifier> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  try {
    return new RecaptchaVerifier(fb.auth, containerId, { size: 'invisible' });
  } catch (e) {
    throw new AppError('generic', `recaptcha: ${String(e)}`);
  }
}

export async function startPhoneVerification(containerId: string, phoneE164: string): Promise<ConfirmationResult> {
  const verifier = await buildRecaptcha(containerId);
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  return signInWithPhoneNumber(fb.auth, phoneE164, verifier);
}

/** Observa sesión; aplica cierre remoto por época y devuelve el perfil. */
export function observeAuth(cb: (user: SpotUser | null) => void): () => void {
  if (DEMO_MODE) {
    try {
      const raw = localStorage.getItem(DEMO_SESSION_KEY);
      cb(raw ? (JSON.parse(raw) as SpotUser) : null);
    } catch {
      cb(null);
    }
    return () => undefined;
  }
  let epochAtLogin: number | null = null;
  let unsub: (() => void) | null = null;
  let cancelled = false;

  void loadFirebase().then(async (fb) => {
    if (!fb || cancelled) return;
    unsub = onAuthStateChanged(fb.auth, async (user) => {
      if (!user) {
        epochAtLogin = null;
        cb(null);
        return;
      }
      const profile = await fetchProfile(user);
      if (epochAtLogin === null) {
        epochAtLogin = profile.sessionEpoch;
      } else if (profile.sessionEpoch !== epochAtLogin) {
        // Sesión revocada remotamente (rotación/forzado desde admin).
        logger.warn('Sesión revocada por cambio de época');
        await fbSignOut(fb.auth);
        cb(null);
        return;
      }
      cb(profile);
    });
  });

  return () => {
    cancelled = true;
    unsub?.();
  };
}
