/**
 * 5.115 · RED DE SEGURIDAD para la imagen del comprobante (v2 · multi-proveedor).
 *
 * Hasta hoy el comprobante SOLO se subía a imgbb. Si la API de imgbb se cae
 * (nos pasó de verdad: imgbb.com responde pero api.imgbb.com se queda
 * colgada), fn-createOrder aborta, la orden NO se crea y el negocio deja de
 * vender mientras dure la caída.
 *
 * Esta lib agrega DESTINOS GRATUITOS DE RESPALDO que orders.ts intenta SOLO
 * cuando imgbb falla, en este orden (solo entra el que tengas configurado):
 *
 *   imgbb (siempre primero, igual que hoy)
 *     1. freeimage.host  → si defines FREEIMAGE_API_KEY   (cuenta gratis)
 *     2. Cloudinary      → si defines CLOUDINARY_CLOUD_NAME + PRESET
 *     3. catbox.moe      → si defines RESPALDO_CATBOX=1 (EXPERIMENTAL: catbox
 *       hostiga a las IPs de datacenter, y Netlify lo es; puede fallar)
 *
 * Nota: Cloudinary quedó en el código por completitud, pero BLOQUEA el
 * registro desde Venezuela ("services are not available in your country").
 * No lo configures; con freeimage y/o catbox basta.
 *
 * Garantías:
 * · Sin NADA configurado devuelve null al instante: el sistema queda
 *   EXACTAMENTE como hoy (solo imgbb).
 * · Todas las URLs son públicas y permanentes → /admin/pagos las muestra
 *   sin ningún cambio.
 * · Los errores internos se atrapan: devuelve null si nadie pudo (jamás
 *   lanza hacia fuera). El mensaje amigable original de imgbb sigue
 *   mandando desde orders.ts.
 * · Acotada en el tiempo (2 intentos × 6 s por proveedor) para no reventar
 *   el presupuesto de la función.
 *
 * Configuración (igual que IMGBB_API_KEY: en .env local y en Netlify):
 *   FREEIMAGE_API_KEY=...      (panel de usuario de freeimage.host → API)
 *   RESPALDO_CATBOX=1          (nada más que poner: no hay cuenta)
 */

const TIMEOUT_MS = 6000; // tope por intento (presupuesto de tiempo acotado)
const INTENTOS = 2; // estos servicios suelen responder en < 3 s
const PAUSA_MS = 600; // pausa entre intentos
const UA = 'spot24-netlify-fn (respaldo de comprobantes)';

type Candidato = {
  nombre: string;
  subir: (signal: AbortSignal) => Promise<string>;
};

/* ------------------------------------------------------------------ */
/* Proveedor 1 · freeimage.host (API Chevereto, clave gratis)          */
/* ------------------------------------------------------------------ */

type RespuestaFreeimage = {
  status_code?: number;
  status_txt?: string;
  error?: { message?: string };
  image?: { url?: string; display_url?: string };
};

async function subirFreeimage(
  image: string,
  key: string,
  signal: AbortSignal,
): Promise<string> {
  // source acepta base64 puro (sin prefijo data:) — igual que imgbb.
  const body = new URLSearchParams({
    key,
    action: 'upload',
    source: image,
    format: 'json',
  }).toString();

  const res = await fetch('https://freeimage.host/api/1/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
    body,
    signal,
  });

  const texto = await res.text();
  let json: RespuestaFreeimage = {};
  try {
    json = JSON.parse(texto) as RespuestaFreeimage;
  } catch {
    throw new Error(`http=${res.status} ${texto.slice(0, 80)}`);
  }
  const url = json.image?.url ?? json.image?.display_url ?? '';
  if (!res.ok || !url.startsWith('http')) {
    throw new Error(`http=${res.status} ${json.error?.message ?? texto.slice(0, 80)}`);
  }
  return url;
}

/* ------------------------------------------------------------------ */
/* Proveedor 2 · Cloudinary (quedó en el código; bloquea registro en VE) */
/* ------------------------------------------------------------------ */

type RespuestaCloudinary = { secure_url?: string; error?: { message?: string } };

async function subirCloudinary(
  image: string,
  cloudName: string,
  preset: string,
  signal: AbortSignal,
): Promise<string> {
  // public_id con ruta incluida → queda ordenado en /comprobantes/ dentro
  // de la cuenta. El sufijo aleatorio evita colisiones.
  const nombre = `comprobantes/spot24-${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;
  const body = new URLSearchParams({
    file: `data:image/jpeg;base64,${image}`,
    upload_preset: preset,
    public_id: nombre,
  }).toString();

  const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
    method: 'POST',
    headers: { 'User-Agent': UA },
    body,
    signal,
  });

  const texto = await res.text();
  let json: RespuestaCloudinary = {};
  try {
    json = JSON.parse(texto) as RespuestaCloudinary;
  } catch {
    throw new Error(`http=${res.status} ${texto.slice(0, 80)}`);
  }
  if (!res.ok || !json.secure_url) {
    throw new Error(`http=${res.status} ${json.error?.message ?? texto.slice(0, 80)}`);
  }
  return json.secure_url;
}

/* ------------------------------------------------------------------ */
/* Proveedor 3 · catbox.moe (sin cuenta, sin clave: solo un flag)      */
/* ------------------------------------------------------------------ */

async function subirCatbox(image: string, signal: AbortSignal): Promise<string> {
  const fd = new FormData();
  fd.append('reqtype', 'fileupload');
  fd.append(
    'fileToUpload',
    new Blob([Buffer.from(image, 'base64')], { type: 'image/jpeg' }),
    'comprobante.jpg',
  );

  const res = await fetch('https://catbox.moe/user/api.php', {
    method: 'POST',
    headers: { 'User-Agent': UA },
    body: fd,
    signal,
  });

  const url = (await res.text()).trim();
  if (!res.ok || !url.startsWith('http')) {
    throw new Error(`http=${res.status} ${url.slice(0, 80)}`);
  }
  return url;
}

/* ------------------------------------------------------------------ */
/* Motor común: reintentos acotados por proveedor                      */
/* ------------------------------------------------------------------ */

async function conReintentos(c: Candidato): Promise<string | null> {
  for (let intento = 1; intento <= INTENTOS; intento++) {
    const ctrl = new AbortController();
    const temporizador = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const url = await c.subir(ctrl.signal);
      console.warn(`[imagen-respaldo] comprobante subido por ${c.nombre} tras fallar imgbb`);
      return url;
    } catch (e) {
      const motivo = e instanceof Error ? e.message : String(e);
      console.warn(
        `[imagen-respaldo] ${c.nombre}: intento ${intento}/${INTENTOS} falló (${motivo})`,
      );
      if (intento < INTENTOS) await new Promise((r) => setTimeout(r, PAUSA_MS));
    } finally {
      clearTimeout(temporizador);
    }
  }
  return null;
}

/**
 * Intenta subir el comprobante (base64 limpio, sin prefijo data:) por los
 * proveedores de respaldo configurados, en orden de prioridad. Devuelve la
 * URL pública permanente del primero que funcione, o null si no hay nada
 * configurado o si todos fallaron (jamás lanza hacia fuera: el error
 * original de imgbb sigue mandando desde orders.ts).
 */
export async function subirComprobanteRespaldo(
  image: string,
): Promise<string | null> {
  if (!image) return null;

  const candidatos: Candidato[] = [];

  const freeKey = (process.env['FREEIMAGE_API_KEY'] ?? '').trim();
  if (freeKey) {
    candidatos.push({
      nombre: 'freeimage.host',
      subir: (signal) => subirFreeimage(image, freeKey, signal),
    });
  }

  const cloudName = (process.env['CLOUDINARY_CLOUD_NAME'] ?? '').trim();
  const preset = (process.env['CLOUDINARY_UPLOAD_PRESET'] ?? '').trim();
  if (cloudName && preset) {
    candidatos.push({
      nombre: 'Cloudinary',
      subir: (signal) => subirCloudinary(image, cloudName, preset, signal),
    });
  }

  if ((process.env['RESPALDO_CATBOX'] ?? '').trim() === '1') {
    candidatos.push({ nombre: 'catbox.moe', subir: (signal) => subirCatbox(image, signal) });
  }

  // Sin nada configurado → cadena de siempre (solo imgbb). Cero impacto.
  if (candidatos.length === 0) return null;

  // El primer proveedor que funcione gana; si todos fallan → null.
  for (const c of candidatos) {
    const url = await conReintentos(c);
    if (url) return url;
  }
  return null;
}
