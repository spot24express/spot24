/**
 * SPOT 24 · Lectura del PDF de inventario con pdfjs-dist legacy (5.87b).
 * TODO el contacto con pdfjs vive en este módulo, separado del core de
 * importación, para que el registro del worker esté en UN solo lugar y sea
 * testeable (src/tests/inventario-pdf.test.ts).
 *
 * REGRESIÓN 5.87b — el dueño importó su PDF y fn-importInventory respondió
 * 400 «No se pudo leer el PDF». Causa real: pdfjs dentro del bundle esbuild
 * de Netlify (node_bundler = esbuild) no encuentra su propio worker. El
 * «fake worker» de Node localiza pdf.worker.mjs usando el import.meta.url
 * del módulo pdf.mjs; al ser BUNDLEADO, esbuild reescribe ese
 * import.meta.url hacia el ARCHIVO DEL BUNDLE y pdfjs buscaba
 * «<carpeta-del-bundle>/pdf.worker.mjs» (que no existe) →
 * «Setting up fake worker failed: Cannot find module …» → el PDF «no se
 * leía» igual en netlify dev y en producción.
 *
 * FIX (escape hatch oficial de pdfjs): pdf.mjs consulta
 * `globalThis.pdfjsWorker?.WorkerMessageHandler` ANTES de resolver rutas en
 * disco (clase PDFWorker → _setupFakeWorkerGlobal). Importamos el módulo del
 * worker DENTRO del bundle y lo registramos en globalThis ANTES de
 * getDocument(): pdfjs toma el handler de memoria y jamás busca el archivo.
 * El bundle sube ~1 MB y desaparece toda dependencia de resolución de
 * rutas. Test de regresión: «pdfjs sobrevive al bundle esbuild».
 *
 * 5.87c — el dueño volvió a recibir el MISMO 400 genérico en su PC: el catch
 * envolvía CUALQUIER fallo de pdfjs con el mismo texto y el error real
 * quedaba invisible (los 400 no imprimen stack en el log de Netlify). Ahora:
 * (1) el error real se registra con console.error (terminal de netlify dev)
 * y viaja RECORTADO en el mensaje que el modal muestra; (2) PDF con
 * contraseña y PDF corrupto/truncado tienen mensaje propio; (3) si una
 * página concreta se cae, el mensaje dice cuál; (4) el registro del worker
 * acepta el namespace ESM plano O envuelto en .default (según versión del
 * bundler) y (5) el documento se destruye siempre (finally) para no fugar
 * memoria en la lambda caliente.
 *
 * 5.87d — el motivo técnico del dueño reveló la causa REAL de sus 400 en
 * local: «Cannot find package 'pdfjs-dist'». netlify dev compila la función
 * a .netlify/functions-serve/ dejando los paquetes npm como IMPORTS
 * EXTERNOS: Node resuelve subiendo node_modules desde ESA ruta y solo
 * alcanza la RAÍZ del proyecto — functions/node_modules (donde el dueño
 * había instalado) queda FUERA de la cadena. FIX: pdfjs-dist también es
 * dependencia de la raíz (package.json) + mensaje PROPIO para
 * ERR_MODULE_NOT_FOUND con la orden exacta (npm install en la raíz +
 * reiniciar netlify dev), porque «¿es el reporte?» otra vez habría
 * despistado otra ronda. En producción es imposible: allí esbuild EMPAQUETA
 * pdfjs dentro del bundle (no está en external_node_modules).
 */
// Tipos de pdfjs (5.87b + 5.87c): el paquete no publica pdf.worker.d.mts y
// la resolución de pdf.mjs depende de functions/node_modules + versión del
// TS del editor (el dueño vio TS2307 en VSC con el runtime funcionando).
// Las referencias triples obligan a TODOS los tsconfig (root, netlify,
// functions) — y a los proyectos inferidos de VSC — a incluir AMBAS
// declaraciones ambientales. Deben ir ANTES de cualquier import.
/// <reference path="./pdfjs-worker.d.ts" />
/// <reference path="./pdfjs.d.ts" />
import { HttpsError } from 'firebase-functions/v2/https';
import type { InvItem } from './inventarioPdf';

/** Tope del PDF en bytes (base64 viaja en el JSON: 4 MB → ~5.4 MB, bajo el
 *  tope de 6 MB del cuerpo de las funciones síncronas de Netlify). */
const MAX_PDF_BYTES = 4 * 1024 * 1024;
/** Tope defensivo de páginas (reportes de miles de ítems). */
const MAX_PAGINAS = 400;

/**
 * Registra el worker de pdfjs en el escape hatch oficial
 * (`globalThis.pdfjsWorker`). Idempotente: si ya hay uno registrado, no
 * importa nada. Debe llamarse ANTES del primer getDocument().
 *
 * BLINDAJE 5.87c: pdf.mjs consulta EXACTAMENTE
 * `globalThis.pdfjsWorker?.WorkerMessageHandler`; según la versión del
 * bundler, el namespace ESM del worker puede venir plano o envuelto en
 * `.default` (interoperabilidad ESM→CJS). Se aceptan ambas formas y se
 * registra SIEMPRE la forma plana { WorkerMessageHandler } que pdf.mjs
 * espera — si el registro fallara, el fake worker busca el archivo en
 * disco y muere con «Setting up fake worker failed» (el 400 de 5.87b).
 */
export async function cargarWorkerPdfjs(): Promise<void> {
  const g = globalThis as unknown as Record<string, unknown>;
  if (g['pdfjsWorker']) return;
  const mod = (await import('pdfjs-dist/legacy/build/pdf.worker.mjs')) as {
    WorkerMessageHandler?: unknown;
    default?: { WorkerMessageHandler?: unknown } | null;
  };
  const handler = mod?.WorkerMessageHandler ?? mod?.default?.WorkerMessageHandler;
  // Solo si hay handler de verdad; si no, pdfjs sigue su camino nativo
  // (fuera de bundlers funciona sin este registro).
  if (handler) g['pdfjsWorker'] = { WorkerMessageHandler: handler };
}

/**
 * Causa técnica CORTA y de UNA línea de un error cualquiera (para el log
 * del servidor y para el mensaje que ve el dueño en el modal).
 */
function causaDe(e: unknown): string {
  const msg = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  return msg.replace(/\s+/g, ' ').trim().slice(0, 160) || 'desconocida';
}

/**
 * 5.87d · Mensaje para el caso «el paquete del lector de PDF no está
 * instalado donde el servidor puede resolverlo».
 *
 * En netlify dev los paquetes npm quedan como IMPORTS EXTERNOS en la
 * función compilada (.netlify/functions-serve/…): Node resuelve subiendo
 * node_modules desde esa ruta y SOLO alcanza la raíz del proyecto —
 * functions/node_modules queda fuera de la cadena. El dueño lo vivió dos
 * rondas: el catch genérico respondía «¿es el reporte de tu sistema?» y
 * el 400 real era ERR_MODULE_NOT_FOUND.
 *
 * Devuelve el mensaje con la ORDEN de arreglo (npm install en la raíz +
 * reiniciar), o null si el error NO es de paquete ausente (deja pasar a
 * los mensajes de Password/InvalidPDF/genérico). Función PURA para poder
 * probarla con un error sintético (vitest no intercepta de forma fiable
 * el import dinámico de un módulo ya cargado).
 */
export function mensajePaqueteAusente(e: unknown): string | null {
  const codigo = (e as { code?: string } | null)?.code ?? '';
  const texto = e instanceof Error ? e.message : String(e);
  if (codigo === 'ERR_MODULE_NOT_FOUND' || /Cannot find package/i.test(texto)) {
    return `Falta el paquete del lector de PDF en tu instalación local (${causaDe(e)}). `
      + 'En la terminal, detente en la carpeta del proyecto (la que contiene package.json, '
      + 'NO dentro de functions/) y ejecuta: npm install. Después reinicia netlify dev.';
  }
  return null;
}

/**
 * Extrae los items de texto (con coordenadas) de cada página del PDF.
 * Valida el base64 y el tamaño, y lanza HttpsError('invalid-argument') con
 * mensajes accionables cuando el archivo no sirve.
 */
export async function extraerItemsPdf(base64: string): Promise<InvItem[][]> {
  let bytes: Buffer;
  try {
    bytes = Buffer.from(base64, 'base64');
  } catch {
    throw new HttpsError('invalid-argument', 'El PDF llegó corrupto (base64 inválido).');
  }
  if (bytes.length < 100) {
    throw new HttpsError('invalid-argument', 'El PDF llegó vacío o incompleto.');
  }
  if (bytes.length > MAX_PDF_BYTES) {
    throw new HttpsError(
      'invalid-argument',
      'El PDF pesa más de 4 MB. Exporta el reporte con menos páginas o comprímelo.',
    );
  }
  let paginas: InvItem[][];
  // Para liberar la memoria del documento aunque algo falle a mitad (el
  // bundle vive caliente en producción: sin destroy(), cada PDF queda).
  let docAbierto: { destroy: () => Promise<void> } | null = null;
  try {
    // FIX 5.87b: el worker DEBE estar registrado ANTES de getDocument().
    await cargarWorkerPdfjs();
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const doc = await pdfjs
      .getDocument({ data: new Uint8Array(bytes), useSystemFonts: true, isEvalSupported: false })
      .promise;
    docAbierto = doc;
    if (doc.numPages > MAX_PAGINAS) {
      throw new HttpsError('invalid-argument', 'El PDF tiene más de 400 páginas.');
    }
    paginas = [];
    for (let p = 1; p <= doc.numPages; p++) {
      let limpios: InvItem[];
      try {
        const page = await doc.getPage(p);
        const tc = await page.getTextContent();
        // Los tipos de pdfjs exponen una unión (TextItem | TextMarkedContent);
        // solo nos sirven los items de texto: se recorta a la forma mínima.
        const items = tc.items as unknown as Array<{
          str?: string;
          transform?: number[];
          width?: number;
        }>;
        limpios = [];
        for (const it of items) {
          const s = String(it.str ?? '');
          if (!s.trim()) continue;
          limpios.push({
            s,
            x: Math.round((it.transform?.[4] ?? 0) * 10) / 10,
            y: Math.round((it.transform?.[5] ?? 0) * 10) / 10,
            w: Math.round((it.width ?? 0) * 10) / 10,
          });
        }
      } catch (e) {
        // 5.87c: se sabe QUÉ página se cayó (un PDF de 300 páginas con una
        // página rota era indistinguible de un PDF ilegible entero).
        throw new Error(`falló la lectura de la página ${p} de ${doc.numPages} (${causaDe(e)})`);
      }
      paginas.push(limpios);
    }
  } catch (e) {
    if (e instanceof HttpsError) throw e;
    // 5.87c · DIAGNÓSTICO PERMANENTE: los 400 no imprimen stack en el log
    // de Netlify (errorResponse solo registra los 5xx), así que el motivo
    // REAL de pdfjs se registra aquí y ADEMÁS viaja en el mensaje que el
    // modal de importación muestra («Motivo: …»). Con el 400 de 5.87b esta
    // línea era genérica y el verdadero error quedó invisible dos rondas.
    console.error('[fn-importInventory] pdfjs no pudo leer el PDF:', e);
    // 5.87d · PAQUETE AUSENTE antes que los demás: si pdfjs no está donde
    // el servidor resuelve, ningún otro mensaje aplica.
    const paquete = mensajePaqueteAusente(e);
    if (paquete) throw new HttpsError('invalid-argument', paquete);
    const nombre = (e as { name?: string } | null)?.name ?? '';
    if (nombre === 'PasswordException') {
      throw new HttpsError(
        'invalid-argument',
        'El PDF está protegido con contraseña: exporta el reporte del sistema SIN protección e inténtalo de nuevo.',
      );
    }
    if (nombre === 'InvalidPDFException') {
      throw new HttpsError(
        'invalid-argument',
        `El PDF llegó corrupto o incompleto (${causaDe(e)}): vuelve a exportar el reporte y súbelo de nuevo.`,
      );
    }
    throw new HttpsError(
      'invalid-argument',
      `No se pudo leer el PDF (motivo técnico: ${causaDe(e)}). Verifica que sea el reporte «Inventario disponible» de tu sistema.`,
    );
  } finally {
    try {
      await docAbierto?.destroy();
    } catch {
      // Nada que liberar (o ya liberado): el resultado no depende de esto.
    }
  }
  return paginas;
}
