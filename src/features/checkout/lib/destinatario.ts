/**
 * SPOT 24 · Ronda 5.135 — ENVIAR A OTRA PERSONA O UBICACIÓN.
 * Ronda 5.135-B — GPS OPCIONAL del destinatario (decisión del dueño): hay
 * casos donde quien recibe no sabe compartir su ubicación (la abuela). Con
 * el checkbox «No tengo la ubicación del destinatario» el pedido viaja SIN
 * punto exacto: los detalles escritos son la única referencia y el mensajero
 * coordina por teléfono. Si el destinatario SÍ puede mandarla, el punto
 * exacto sigue siendo lo mejor (el flujo 5.135 queda intacto).
 *
 * El comprador paga (contact = pagador, INTACTO) y el pedido llega a un
 * destinatario distinto: su nombre, su teléfono y SU dirección de entrega
 * (zona + detalles + GPS del punto). Decisiones aprobadas por el dueño:
 * · (1) La tarifa se cotiza con la zona del DESTINATARIO — el mensajero
 *   viaja adonde va el paquete, no adonde está el comprador.
 * · (2) El teléfono del destinatario va en claro para cajera y mensajero —
 *   mismo trato que el del comprador desde la ronda 5.9.
 * · (3) Pagador y antifraude sin cambios — el destinatario no paga ni da
 *   cédula; solo nombre, teléfono y dirección de entrega.
 *
 * El punto exacto de entrega se llena de DOS maneras (el comprador casi
 * nunca está parado en la casa de quien recibe):
 * · el botón GPS del dispositivo (si compró estando allí), o
 * · pegando el enlace / coordenadas que el destinatario compartió por
 *   WhatsApp o Google Maps — parsearUbicacionTexto() lo convierte a
 *   {lat, lng} igual que el GPS capturado.
 *
 * Todo aquí es PURO (sin React, sin Firestore): testeado en
 * src/tests/destinatario.test.ts.
 */
import type { DestinatarioData } from '../types';
import {
  isValidPersonName,
  isValidPhoneVE,
  normalizePhoneVE,
  sanitizeMultiline,
  sanitizeText,
} from '@/shared/lib/validation';

/** Formulario del bloque «Enviar a otra persona» del paso Entrega. */
export interface EntregaTerceroForm {
  /** Nombre y apellido de quien recibe (el pagador sigue siendo el comprador). */
  nombre: string;
  /** Teléfono móvil local de quien recibe (0412/0414/0416/0422/0424/0426). */
  telefono: string;
  /** Zona de cobertura del DESTINATARIO: define la tarifa (decisión 1). */
  zoneId: string;
  /** Dirección completa: urbanización, calle, casa/apto, referencia. */
  details: string;
  /** Punto exacto de entrega: GPS capturado o enlace pegado. */
  gps: { lat: number; lng: number } | null;
  /**
   * 5.135-B · El comprador NO tiene el GPS del destinatario: el pedido viaja
   * sin punto exacto, los detalles escritos son la única referencia y el
   * mensajero coordina por teléfono con quien recibe.
   */
  sinUbicacion: boolean;
}

/** Formulario recién activado (el suiche se enciende con esto). */
export const ENTREGA_TERCERO_VACIO: EntregaTerceroForm = {
  nombre: '',
  telefono: '',
  zoneId: '',
  details: '',
  gps: null,
  sinUbicacion: false,
};

/**
 * Valida el formulario del destinatario → mapa campo→error ({} = válido).
 * Misma exigencia de calidad que la dirección del comprador: sin zona no hay
 * cotización, sin punto exacto el mensajero no llega (el GPS es obligatorio
 * SALVO que el comprador marque «sinUbicacion», 5.135-B: entonces los
 * detalles escritos —que siguen obligatorios— son la única referencia).
 * Las llaves usan el prefijo «tercero» para no chocar con los errores de los
 * campos del comprador en el mismo paso.
 */
export function validarEntregaTercero(f: EntregaTerceroForm): Record<string, string> {
  const e: Record<string, string> = {};
  if (!isValidPersonName(sanitizeText(f.nombre, 80))) {
    e['terceroNombre'] = 'Nombre y apellido de quien recibe.';
  }
  if (!isValidPhoneVE(f.telefono)) {
    e['terceroTelefono'] = 'Teléfono móvil de quien recibe: 0412, 0414, 0416, 0422, 0424 o 0426.';
  }
  if (!f.zoneId) {
    e['terceroZoneId'] = 'Elige la zona de entrega del destinatario.';
  }
  if (sanitizeMultiline(f.details, 500).length < 8) {
    e['terceroDetails'] = f.sinUbicacion
      ? 'Sin GPS, la dirección escrita es obligatoria: urbanización, calle, casa/apto y punto de referencia.'
      : 'Dirección del destinatario con urbanización, calle y casa/piso.';
  }
  // 5.135-B · El punto exacto solo se exige cuando el comprador NO marcó
  // «No tengo la ubicación del destinatario». Con la marca, el mensajero
  // coordina por teléfono (el teléfono siempre va en claro, decisión 2).
  if (!f.sinUbicacion && !f.gps) {
    e['terceroGps'] = 'Falta el punto exacto: GPS o enlace de Google Maps de quien recibe.';
  }
  return e;
}

/**
 * Formulario saneado → bloque `entregaTercero` del payload de createOrder.
 * SOLO quién recibe (nombre + teléfono): la dirección de entrega viaja en
 * `address` (la estructura de siempre), que en este modo ES la del
 * destinatario — el backend la cifra y construye el preview «Para: …».
 * 5.135-B: `sinUbicacion` viaja SOLO si el comprador marcó el checkbox —
 * compras de tercero normales ni lo traen (contrato limpio como en 5.135).
 */
export function construirEntregaTercero(f: EntregaTerceroForm): DestinatarioData {
  return {
    nombre: sanitizeText(f.nombre, 80),
    telefono: normalizePhoneVE(f.telefono),
    ...(f.sinUbicacion ? { sinUbicacion: true as const } : {}),
  };
}

/**
 * Extrae {lat, lng} del texto que el destinatario compartió:
 * · Enlace de Google Maps  ?q=lat,lng      → https://maps.google.com/?q=10.2546,-67.5912
 * · Enlace de Google Maps  /@lat,lng,17z   → https://www.google.com/maps/@10.2546,-67.5912,17z
 * · Enlace de lugar        !3dlat!4dlng    → https://www.google.com/maps/place/…!3d10.2546!4d-67.5912
 * · Enlace geo: de Android                 → geo:10.2546,-67.5912
 * · Coordenadas peladas                    → «10.2546, -67.5912» (orden lat, lng)
 * Devuelve null si no hay nada usable (incluidos los enlaces cortos
 * maps.app.goo.gl, que no traen coordenadas dentro del URL).
 * Redondea a 6 decimales (~11 cm) igual que el GPS capturado en el checkout.
 */
export function parsearUbicacionTexto(raw: string): { lat: number; lng: number } | null {
  const t = String(raw ?? '').trim().replace(/^geo:/i, '');
  if (!t) return null;
  const hallados: Array<{ lat: number; lng: number }> = [];
  // !3dlat!4dlng (enlace de un lugar concreto de Maps) PRIMERO: un enlace de
  // lugar también trae /@lat,lng del viewport, pero el !3d!4d es el punto
  // PRECISO del sitio — si ambos calzan, gana el preciso.
  const mPlace = t.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/i);
  if (mPlace) hallados.push({ lat: Number(mPlace[1]), lng: Number(mPlace[2]) });
  // ?q=lat,lng (la variante que WhatsApp comparte al mandar ubicación).
  const mQ = t.match(/[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i);
  if (mQ) hallados.push({ lat: Number(mQ[1]), lng: Number(mQ[2]) });
  // /@lat,lng,zoom (enlace «copiar» del navegador de Maps).
  const mAt = t.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (mAt) hallados.push({ lat: Number(mAt[1]), lng: Number(mAt[2]) });
  // Coordenadas peladas «lat, lng».
  const mPlano = t.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
  if (mPlano) hallados.push({ lat: Number(mPlano[1]), lng: Number(mPlano[2]) });

  for (const { lat, lng } of hallados) {
    if (
      Number.isFinite(lat) && Number.isFinite(lng) &&
      Math.abs(lat) <= 90 && Math.abs(lng) <= 180 &&
      (lat !== 0 || lng !== 0)
    ) {
      return { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 };
    }
  }
  return null;
}
