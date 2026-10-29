/**
 * Módulo auth · Capa de servicios (Firebase Auth + perfil en Firestore).
 * Roles mediante custom claims (5.3). Cierre de sesión remoto por época de
 * sesión en users/{uid}.sessionEpoch.
 *
 * Ronda 4 — DECISIÓN DE PRODUCTO (plan gratuito):
 * · La verificación por SMS se retira del flujo del cliente: la cuota de
 *   ~10 SMS/día del plan Spark no escala con usuarios reales. El teléfono
 *   queda como DATO del perfil (obligatorio y validado por formato en el
 *   registro); su confirmación real pasa a ser operativa (llamada/WhatsApp
 *   del equipo al coordinar la entrega) y el antifraude del backend sigue
 *   evaluando cada pedido.
 * · fetchProfile ahora lee users/{uid}.phoneE164 y lo expone en
 *   SpotUser.phone: Mi Cuenta muestra el teléfono declarado aunque nunca
 *   se haya vinculado por SMS (antes mostraba «Sin verificar» siempre).
 * · startPhoneVerification / normalizePhoneAuthError se conservan
 *   INTENCIONALMENTE (dormidos, sin entrada en la UI): reactivar la
 *   verificación con un plan superior es volver a montar el botón y el
 *   modal de AccountPage — nada más.
 */

import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut as fbSignOut,
  sendPasswordResetEmail, onAuthStateChanged, updateProfile,
  reauthenticateWithCredential, updatePassword, EmailAuthProvider,
  RecaptchaVerifier, linkWithPhoneNumber, type ConfirmationResult, type RecaptchaVerifier as RecaptchaVerifierType, type User,
} from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { loadFirebase } from '@/shared/lib/firebase';
import { logger } from '@/shared/lib/logger';
import { AppError } from '@/shared/lib/errors';
import { sanitizeText, sanitizeDigits, sanitizeMultiline, isValidEmail, isValidPhoneVE, normalizePhoneVE } from '@/shared/lib/validation';
import type { SpotUser } from '../types';

/* ── Mensajes de error genéricos: el detalle técnico solo a logs (6.9) ── */
const GENERIC = 'Correo o clave incorrectos. Revisa e intenta de nuevo.';

function mapUser(user: User, extra?: Partial<SpotUser>): SpotUser {
  return {
    uid: user.uid,
    email: user.email,
    phone: user.phoneNumber,
    name: user.displayName ?? '',
    // Perfil extendido (5.75): el doc users/{uid} los completa en fetchProfile.
    cedula: '',
    address: '',
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
  let phone = base.phone;
  let cedula = base.cedula;
  let address = base.address;
  let sessionEpoch = 0;
  // Ronda 5i-l: rol leído del doc users/{uid} como RESPALDO del claim.
  // ¿Por qué? El ID token vive ~1 h: si el admin asigna el rol con la sesión
  // abierta y el usuario recarga sin cerrar sesión, getIdTokenResult()
  // devuelve el token CACHEADO con el claim viejo (customer) → sin enlace
  // «Panel», sin alerta de pedidos y con el guard expulsándolo. El doc, en
  // cambio, lo actualiza fn-setRole AL INSTANTE y las reglas de Firestore
  // congelan ese campo para el cliente (solo Cloud Functions lo escriben):
  // es una fuente fresca y no falsificable. El claim manda cuando existe
  // (autoritativo); el doc solo repara el token viejo.
  let docRole: unknown = null;
  if (fb) {
    const snap = await getDoc(doc(fb.db, 'users', user.uid)).catch(() => null);
    if (snap?.exists()) {
      name = String(snap.data()['name'] ?? name);
      sessionEpoch = Number(snap.data()['sessionEpoch'] ?? 0);
      // Teléfono DECLARADO en el registro (puede no estar vinculado por SMS).
      const stored = snap.data()['phoneE164'];
      if (typeof stored === 'string' && stored.trim() !== '') {
        phone = stored.trim();
      }
      // Perfil extendido (5.75): cédula (solo dígitos) y dirección completa.
      // 5.92g: la cédula ya NO se corrige en Mi Cuenta (decisión del dueño) —
      // la del registro sigue prellenando cada compra; las cuentas antiguas
      // sin cédula la escriben en el checkout. La dirección sí se actualiza
      // en «Actualización de mis Datos de entrega».
      const storedCedula = snap.data()['cedula'];
      if (typeof storedCedula === 'string' && storedCedula.trim() !== '') {
        cedula = storedCedula.trim();
      }
      const storedAddress = snap.data()['address'];
      if (typeof storedAddress === 'string' && storedAddress.trim() !== '') {
        address = storedAddress.trim();
      }
      docRole = snap.data()['role'];
    }
  }
  const asRole = (v: unknown): SpotUser['role'] | null =>
    v === 'admin' || v === 'cajero' || v === 'delivery' || v === 'gerente'
      ? v
      : null;
  return {
    ...base,
    name,
    phone,
    cedula,
    address,
    sessionEpoch,
    role: asRole(claimsRole) ?? asRole(docRole) ?? 'customer',
  };
}

/* ───────────────────────────── API pública ───────────────────────────── */

export async function signUpEmail(
  name: string,
  email: string,
  password: string,
  phoneE164: string,
  cedula: string,
  address: string,
): Promise<SpotUser> {
  if (!isValidEmail(email)) throw new AppError('generic', 'email inválido en signUp');
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  // 5.75: cédula SOLO dígitos (1-8) y dirección sanitizada con saltos.
  const ced = sanitizeDigits(cedula, 8);
  const addr = sanitizeMultiline(address, 200);
  try {
    const cred = await createUserWithEmailAndPassword(fb.auth, email.trim(), password);
    await updateProfile(cred.user, { displayName: sanitizeText(name, 80) });
    const nowMs = Date.now();
    await setDoc(
      doc(fb.db, 'users', cred.user.uid),
      {
        name: sanitizeText(name, 80),
        email: email.trim().toLowerCase(),
        phoneE164: sanitizeText(phoneE164, 20),
        cedula: ced,
        address: addr,
        role: 'customer',
        sessionEpoch: nowMs,
        createdAt: serverTimestamp(),
        // Insumo del antifraude (fraud.ts): marca REAL de creación de cuenta.
        // Antes faltaba y TODAS las órdenes salían con la bandera
        // 'cuenta_nueva' — ahora el semáforo de riesgo es de verdad.
        createdAtMs: nowMs,
      },
      { merge: true },
    );
    return mapUser(cred.user, { name: sanitizeText(name, 80), cedula: ced, address: addr, sessionEpoch: nowMs });
  } catch (e) {
    logger.warn('signUp falló', e);
    const code = (e as { code?: string }).code ?? '';
    if (code.includes('email-already-in-use')) throw new AppError('generic', 'email en uso');
    if (code.includes('weak-password')) throw new AppError('generic', 'clave débil');
    throw new AppError('generic', GENERIC);
  }
}

export async function signInEmail(email: string, password: string): Promise<SpotUser> {
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

/**
 * Guarda TELÉFONO y dirección del PROPIO usuario en users/{uid} (5.75 «Mis
 * datos»; 5.92g por pedido del dueño: SOLO el número de teléfono y la
 * dirección completa son editables en Mi Cuenta — la cédula ya no se toca
 * aquí: la que quedó del registro sigue prellenando cada compra en el
 * checkout, contacto y «Cédula del pagador» del pago móvil).
 * El teléfono se acepta en cualquier formato venezolano (0414…, 414…,
 * +58414…) y se guarda en users/{uid}.phoneE164 como E.164 (+58…), la misma
 * convención del registro; la UI siempre lo muestra en formato local.
 * Reglas: la lista blanca de update ya incluía phoneE164 — Firestore sin
 * cambios. Devuelve los valores ya sanitizados para parchear el store sin
 * relectura.
 */
export async function saveCustomerData(phone: string, address: string): Promise<{ phone: string; address: string }> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  const user = fb.auth.currentUser;
  if (!user) throw new AppError('unauthenticated', 'Inicia sesión para guardar tus datos.');
  const local = normalizePhoneVE(phone);
  if (!isValidPhoneVE(local)) throw new AppError('generic', 'Teléfono inválido. Usa un móvil venezolano: 04141234567.');
  const e164 = `+58${local.startsWith('0') ? local.slice(1) : local}`;
  const addr = sanitizeMultiline(address, 200);
  if (addr.length < 8) throw new AppError('generic', 'La dirección necesita urbanización, calle y casa/apto.');
  await setDoc(doc(fb.db, 'users', user.uid), { phoneE164: e164, address: addr }, { merge: true });
  return { phone: e164, address: addr };
}

/**
 * Cambio de contraseña en sesión (ronda 5.75): re-autentica con la clave
 * ACTUAL (Firebase lo exige) y actualiza. Sin correos, sin reenvío: el
 * cliente resuelve en 20 segundos desde Mi Cuenta.
 */
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  const user = fb.auth.currentUser;
  if (!user || !user.email) {
    throw new AppError('unauthenticated', 'Inicia sesión para cambiar tu contraseña.');
  }
  // 1) Re-autenticación: confirma identidad con la clave actual.
  try {
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPassword));
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    logger.warn('changePassword · reauth falló', code);
    if (code.includes('wrong-password')) {
      throw new AppError('generic', 'La contraseña actual no coincide.');
    }
    if (code.includes('too-many-requests')) {
      throw new AppError('generic', 'Demasiados intentos. Espera un minuto e intenta de nuevo.');
    }
    if (code.includes('network-request-failed')) {
      throw new AppError('generic', 'Sin conexión con Firebase. Revisa tu red e intenta de nuevo.');
    }
    throw new AppError('generic', 'No pudimos confirmar tu identidad. Revisa la contraseña actual.');
  }
  // 2) Actualización de la clave (la sesión acaba de revalidarse: no hay
  //    requires-recent-login en la práctica; igual lo mapeamos por si acaso).
  try {
    await updatePassword(user, newPassword);
  } catch (e) {
    const code = (e as { code?: string }).code ?? '';
    logger.warn('changePassword · update falló', code);
    if (code.includes('weak-password')) {
      throw new AppError('generic', 'La nueva contraseña necesita al menos 6 caracteres.');
    }
    if (code.includes('requires-recent-login')) {
      throw new AppError('generic', 'Por seguridad, cierra sesión, vuelve a entrar e intenta de nuevo.');
    }
    throw new AppError('generic', 'No pudimos cambiar la contraseña. Intenta de nuevo en unos segundos.');
  }
}

/* ─────────── Verificación de teléfono (DORMIDA — plan de pago futuro) ───────────
 * Este bloque quedó sin punto de entrada en la UI (decisión Ronda 4: la cuota
 * de SMS del plan gratuito no escala). Se conserva completo y probado porque:
 * · linkWithPhoneNumber (NO signInWithPhoneNumber) es la operación correcta
 *   para verificar el teléfono de una sesión activa: al confirmar el SMS el
 *   número queda vinculado a ESA cuenta (user.phoneNumber pasa a tener valor).
 * · El RecaptchaVerifier se administra como singleton con limpieza previa
 *   (evita «reCAPTCHA has already been rendered» al reabrir el modal).
 * · normalizePhoneAuthError registra el código crudo en consola y mapea los
 *   códigos de configuración (proveedor desactivado, App Check «Aplicar»,
 *   dominio/API key, red) a mensajes accionables.
 * Para reactivarlo con plan de pago: volver a montar el botón y el modal en
 * AccountPage apuntando a startPhoneVerification('spot-recaptcha', e164). */

let activeVerifier: RecaptchaVerifierType | null = null;

/** Limpia el verificador invisible anterior si quedó montado. */
function disposeVerifier(): void {
  if (!activeVerifier) return;
  try {
    activeVerifier.clear();
  } catch {
    /* ya estaba limpio */
  }
  activeVerifier = null;
}

/**
 * Traduce los códigos de Firebase Auth a mensajes accionables de marca.
 * Cada AppError lleva el texto para la UI en .message (el modal de teléfono
 * lo muestra tal cual; userMessage() genérico no aplica aquí).
 * El código crudo queda en consola para diagnóstico del desarrollador.
 */
export function normalizePhoneAuthError(e: unknown): AppError {
  const raw = e as { code?: string; message?: string } | null;
  if (raw && typeof raw === 'object' && (raw.code || raw.message)) {
    // Scrubbed por logger: nunca imprime el número ni datos personales.
    logger.warn('verify-phone · Firebase rechazó la operación:', raw.code ?? '(sin code)', raw.message ?? '');
  } else {
    logger.warn('verify-phone · error no tipado', e);
  }

  const code = raw?.code ?? '';

  /* ── Causas de configuración del PROYECTO (las típicas del 400) ── */
  if (code.includes('operation-not-allowed')) {
    return new AppError('generic',
      'El acceso por teléfono está desactivado en este proyecto. '
      + 'Firebase Console → Authentication → Sign-in method → «Teléfono» → Activar. Luego reintenta.');
  }
  if (code.includes('invalid-app-credential') || code.includes('invalid-app-check-token')) {
    return new AppError('generic',
      'Firebase rechazó la credencial de la app (App Check). '
      + 'En Firebase Console → App Check → APIs, marca «Identity Toolkit API» como Sin aplicar (desarrollo) '
      + 'o registra el token de debug local. Después recarga la página.');
  }
  if (code.includes('app-not-authorized') || code.includes('api-key-not-valid')) {
    return new AppError('generic',
      'La clave API o el dominio no están autorizados. '
      + 'Revisa las restricciones de la clave en Google Cloud → Credenciales y '
      + 'Authentication → Settings → Authorized domains.');
  }
  if (code.includes('unauthorized-domain')) {
    return new AppError('generic',
      'Este dominio no está autorizado: Firebase Console → Authentication → Settings → Authorized domains.');
  }
  if (code.includes('network-request-failed')) {
    return new AppError('generic',
      'Sin conexión con Firebase. Revisa tu red (o un bloqueador de anuncios) e intenta de nuevo.');
  }

  /* ── Causas del usuario / flujo ── */
  if (code.includes('provider-already-linked') || code.includes('credential-already-in-use')) {
    return new AppError('generic', 'Ese teléfono ya está verificado o pertenece a otra cuenta.');
  }
  if (code.includes('invalid-phone-number')) {
    return new AppError('generic', 'Teléfono inválido. Usa formato venezolano: 04141234567.');
  }
  if (code.includes('invalid-verification-code')) {
    return new AppError('generic', 'Código incorrecto. Revisa el SMS e intenta de nuevo.');
  }
  if (code.includes('code-expired')) {
    return new AppError('generic', 'El código venció. Pide uno nuevo.');
  }
  if (code.includes('too-many-requests') || code.includes('quota-exceeded')) {
    return new AppError('generic',
      'Se agotaron los intentos o la cuota diaria de SMS del plan. '
      + 'Espera unos minutos o registra el número como «número de prueba» en Firebase Console.');
  }
  if (code.includes('captcha-check-failed') || code.includes('missing-verification')) {
    return new AppError('generic',
      'No pudimos validar que eres humano. Desactiva bloqueadores, recarga la página e intenta de nuevo.');
  }
  return new AppError('generic', 'No pudimos enviar el código. Intenta de nuevo en unos segundos.');
}

/**
 * Verifica el teléfono del usuario EN SESIÓN: envía el SMS por linkWithPhoneNumber
 * y devuelve el ConfirmationResult cuyo .confirm(codigo) VINCULA el número.
 * DORMIDA: sin llamada desde la UI mientras el proyecto use el plan gratuito.
 */
export async function startPhoneVerification(containerId: string, phoneE164: string): Promise<ConfirmationResult> {
  const fb = await loadFirebase();
  if (!fb) throw new AppError('generic', 'Firebase no configurado');
  const user = fb.auth.currentUser;
  if (!user) throw new AppError('unauthenticated', 'Sesión requerida para verificar el teléfono.');

  // SMS y plantillas en español (se aplica una sola vez por sesión).
  if (fb.auth.languageCode !== 'es') fb.auth.languageCode = 'es';

  disposeVerifier();
  try {
    // El contenedor debe estar en el DOM (el modal lo monta al abrirse).
    activeVerifier = new RecaptchaVerifier(fb.auth, containerId, { size: 'invisible' });
    return await linkWithPhoneNumber(user, phoneE164, activeVerifier);
  } catch (e) {
    disposeVerifier();
    throw normalizePhoneAuthError(e);
  }
}

/** Observa sesión; aplica cierre remoto por época y devuelve el perfil. */
export function observeAuth(cb: (user: SpotUser | null) => void): () => void {
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

/**
 * 5.112.1 · «Eliminar mi cuenta» (privacidad, derecho al olvido): pide al
 * servidor la BAJA COMPLETA de la propia cuenta (ficha user, carrito, tokens
 * de notificaciones y acceso de autenticación; los pedidos históricos se
 * conservan como registro contable). El uid viaja DENTRO del token Bearer —
 * el servidor jamás lo toma del body — y solo el rol customer puede
 * auto-eliminarse. Sin re-autenticación en el cliente: la sesión vigente ya
 * está verificada por el backend (checkRevoked). Operación IDEMPOTENTE del
 * lado servidor: si la cuenta ya no existe (reintento tras un fallo), el
 * servidor limpia restos y responde ok — reintentar nunca deja a medias.
 */
export async function deleteMyAccount(): Promise<void> {
  const { callFunction } = await import('@/shared/lib/backend');
  await callFunction<void>('fn-deleteMyAccount');
}