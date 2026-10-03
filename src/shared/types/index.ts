/** Tipos compartidos de la capa de servicios (contratos Firestore). */

export interface ContactData {
  name: string;
  phone: string; // cifrado AES-256-GCM en reposo (backend)
  cedula: string; // cifrado en reposo (backend)
}

export interface AddressData {
  state: string;
  city: string;
  zoneId: string;
  zoneName: string;
  details: string; // urbanización, calle, casa/piso, punto de referencia
  /** Coordenadas GPS del cliente (obligatorias en delivery): las usa el mensajero. */
  location?: { lat: number; lng: number } | null;
}

export interface UserProfile {
  uid: string;
  name: string;
  email: string;
  phone?: string;
  role: 'customer' | 'admin';
  sessionEpoch: number;
  createdAt: number;
}

/** Resultado de paginación por cursor (nunca consultas sin límite). */
export interface Page<T> {
  items: T[];
  cursor: string | null; // cursor opaco codificado en base64
  hasMore: boolean;
}