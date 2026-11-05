/**
 * SPOT 24 · Dueño del dispositivo (ronda 5.122, pedido del dueño).
 * ────────────────────────────────────────────────────────────────────
 * Tres cajeras comparten UN equipo por turnos. El token FCM es del
 * NAVEGADOR (todas obtienen el MISMO token), pero el doc vive por USUARIO
 * (users/{uid}/fcmTokens). Sin traspaso, cada cuenta que activara
 * notificaciones dejaría SU doc con el mismo token → cada aviso de pedido
 * suena N veces, queda en el historial de cuentas fuera de turno y el
 * self-healing 5.72 re-registraría el dispositivo bajo cualquiera que
 * abriera «Mi cuenta».
 *
 * Qué hace coreTransferDeviceTokens (el cliente lo llama al INICIAR SESIÓN):
 * · Busca en el PERSONAL (admin/gerente/cajero/delivery) docs de fcmTokens
 *   de ESTE dispositivo (mismo deviceId; o mismo token en docs legacy sin
 *   deviceId) que pertenezcan a OTRO usuario.
 * · Los TRASPASA al usuario que entra: copia el doc a su subcolección
 *   (preservando createdAt) y borra los ajenos. El token NO cambia → el
 *   equipo no queda mudo ni un segundo, el toggle sigue encendido y nadie
 *   vuelve a activar nada: «el equipo queda de la cajera en turno».
 * · SOLO ENTRE PERSONAL (guardia): si quien entra es un cliente, no-op —
 *   atienden a un cliente en el mostrador y la tienda NO se queda muda.
 * · Si no hay docs de otros (primera vez / ya es suyo): no-op.
 *
 * Por qué SOLO personal: el caso de negocio es el panel compartido de la
 * tienda (4 roles, consulta acotada sin índices nuevos). Un cliente que
 * comparte navegador conserva SUS avisos de SUS pedidos (correcto) y NO
 * puede quitarle el equipo al personal (guardia, y al revés también: el
 * personal no quita a nadie su teléfono). Escanear todos los users por
 * cada login sería un costo injustificado.
 *
 * Best-effort: el cliente lo llama fire-and-forget; cualquier fallo se
 * responde con error canónico y JAMÁS bloquea el login.
 */
import admin from 'firebase-admin';
import { createHash } from 'node:crypto';
import { HttpsError, onCall, type CallableRequest } from 'firebase-functions/v2/https';
import { getAdminApp, type CoreCtx } from './lib/ctx';
import { tryRateLimit } from './lib/ratelimit';

const db = () => admin.firestore(getAdminApp());

function requireAuth(ctx: CoreCtx): string {
  if (!ctx.auth) throw new HttpsError('unauthenticated', 'Sesión requerida.');
  return ctx.auth.uid;
}

function requireAppCheck(ctx: CoreCtx): void {
  if (ctx.app) return;
  if (process.env['APPCHECK_ENFORCE'] === 'true') {
    throw new HttpsError('failed-precondition', 'App Check requerido.');
  }
}

/** Roles del personal: los únicos que comparten el panel de la tienda. */
const ROLES_PERSONAL = ['admin', 'gerente', 'cajero', 'delivery'] as const;

/** Guardia del traspaso: ¿este rol pertenece al personal que comparte el
 *  panel? El traspaso solo ocurre ENTRE personal — un cliente que entra en
 *  el equipo de la tienda jamás se lleva el dispositivo (el panel sigue
 *  sonando con quien quedó en turno) y en SU propio equipo no toca nada. */
export function esPersonal(rol: unknown): boolean {
  return (ROLES_PERSONAL as readonly string[]).includes(String(rol ?? ''));
}

/** Tope de docs de token revisados por usuario (mismo tope del envío de avisos). */
const TOPE_TOKENS_POR_USUARIO = 20;

/** Formato del deviceId que genera el cliente (UUID v4 o fallback d-…). */
export function sanearDeviceId(v: unknown): string {
  const s = String(v ?? '').trim();
  return /^[A-Za-z0-9-]{8,80}$/.test(s) ? s : '';
}

/** Token FCM (opcional): solo sirve para hallar docs legacy sin deviceId. */
export function sanearTokenFcm(v: unknown): string {
  const s = String(v ?? '').trim();
  return s.length >= 40 && s.length <= 256 ? s : '';
}

/** Mismo esquema que el cliente (hashToken): id de doc legacy por token. */
function hashTokenAdmin(token: string): string {
  return createHash('sha256').update(token).digest('hex').slice(0, 40);
}

/** Datos que se traspasan de un doc ajeno al usuario que entra. */
interface DocOrigen {
  token: string;
  userAgent: string;
  createdAt: number;
}

/**
 * Elige el doc canario: el primero con token válido (el barrido es
 * determinista por usuario y docId; si hubiera varios, el hallado primero
 * sirve de origen y los demás quedan en la lista de borrados).
 */
export function elegirDocOrigen(
  candidatos: Array<{ uidDueno: string; data: Record<string, unknown> }>,
): DocOrigen | null {
  for (const c of candidatos) {
    const token = String(c.data['token'] ?? '');
    if (token) {
      return {
        token,
        userAgent: String(c.data['userAgent'] ?? '').slice(0, 120),
        createdAt: Number(c.data['createdAt'] ?? 0) || 0,
      };
    }
  }
  return null;
}

export async function coreTransferDeviceTokens(ctx: CoreCtx): Promise<unknown> {
  const uid = requireAuth(ctx);
  requireAppCheck(ctx);
  await tryRateLimit({ bucket: 'transferDevice', identity: uid, max: 30, windowMs: 60 * 60 * 1000 });

  const d = (ctx.data ?? {}) as Record<string, unknown>;
  const deviceId = sanearDeviceId(d['deviceId']);
  const tokenFcm = sanearTokenFcm(d['token']);
  if (!deviceId && !tokenFcm) {
    throw new HttpsError('invalid-argument', 'Identidad del dispositivo requerida.');
  }

  // 1 · GUARDIA: solo el personal traspasa el equipo. Cubre el caso real de
  //     atender a un cliente en el equipo de la tienda (revisar su cuenta,
  //     registrarla): sin esta guardia el cliente se llevaría el dispositivo
  //     y la tienda quedaría MUDA hasta que el personal volviera a entrar.
  //     Todas las cuentas nuevas nacen cliente → registrar a alguien en el
  //     mostrador tampoco mueve nada. Costo: 1 lectura por llamada.
  const perfil = await db().doc(`users/${uid}`).get();
  if (!esPersonal(perfil.data()?.['role'])) {
    return { moved: 0, removed: 0, cliente: true };
  }

  // 2 · Barrer los tokens del personal y hallar los docs de ESTE dispositivo
  //     que pertenezcan a OTRO usuario (lo propio jamás se toca).
  const candidatos: Array<{ uidDueno: string; data: Record<string, unknown> }> = [];
  const aBorrar: FirebaseFirestore.DocumentReference[] = [];
  const personal = await db().collection('users').where('role', 'in', [...ROLES_PERSONAL]).get();
  await Promise.all(
    personal.docs.map(async (u) => {
      if (u.id === uid) return;
      const toks = await u.ref.collection('fcmTokens').limit(TOPE_TOKENS_POR_USUARIO).get();
      toks.docs.forEach((t) => {
        const data = t.data();
        const mismoDispositivo = deviceId !== '' && String(data['deviceId'] ?? '') === deviceId;
        const mismoToken = tokenFcm !== '' && String(data['token'] ?? '') === tokenFcm;
        if (!mismoDispositivo && !mismoToken) return;
        candidatos.push({ uidDueno: u.id, data });
        aBorrar.push(t.ref);
      });
    }),
  );

  const origen = elegirDocOrigen(candidatos);
  if (!origen) return { moved: 0, removed: 0 }; // dispositivo sin push activo: nada que traspasar

  // 3 · Copiar el doc al usuario que entra. docId = deviceId (esquema v2);
  //     si el hallazgo fue por token puro (legacy sin deviceId), hash del token.
  const docId = deviceId || hashTokenAdmin(origen.token);
  const refDestino = db().doc(`users/${uid}/fcmTokens/${docId}`);
  const previo = await refDestino.get();
  const now = Date.now();
  await refDestino.set(
    {
      token: origen.token,
      userAgent: origen.userAgent,
      deviceId,
      schema: 'v2-device',
      // Re-login del mismo dispositivo: conservar el createdAt original.
      createdAt: previo.exists ? Number(previo.data()?.['createdAt'] ?? 0) || now : origen.createdAt || now,
      updatedAt: now,
    },
    { merge: true },
  );

  // 4 · Borrar los docs ajenos (son pocos; batch por tramos de 400 por tope).
  for (let i = 0; i < aBorrar.length; i += 400) {
    const batch = db().batch();
    aBorrar.slice(i, i + 400).forEach((ref) => batch.delete(ref));
    await batch.commit();
  }

  // Log visible en Netlify (5.73): cuántos docs traspasó este login.
  console.warn(`[deviceTokens] ${uid}: traspaso de ${aBorrar.length} doc(s) del dispositivo ${docId}`);
  return { moved: aBorrar.length, removed: aBorrar.length };
}

/** Envoltorio Cloud Function (paridad con el resto de los cores, 5.122). */
export const fnTransferDeviceTokens = onCall(
  { region: 'us-central1', consumeAppCheckToken: true, cors: true, maxInstances: 10 },
  (req: CallableRequest) => coreTransferDeviceTokens(req as unknown as CoreCtx),
);
