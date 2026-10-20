/**
 * SPOT 24 · Declaración de tipos del lector de pdfjs-dist (5.87c).
 *
 * El dueño reportó en VSC (pegando lib/extraerPdf.ts en su PC):
 *   TS2307 «No se encuentra el módulo "pdfjs-dist/legacy/build/pdf.mjs"»
 * — SOLO en el editor: el runtime funciona (la función llegó a ejecutarse),
 * pero la resolución de tipos depende de que functions/node_modules tenga
 * pdfjs-dist instalado Y de que el TS del editor haga el paso .mjs →
 * pdf.d.mts igual que la CLI. Esta declaración ambiental (mismo patrón del
 * worker en pdfjs-worker.d.ts, 5.87b) hace el import AUTODECLARADO: compila
 * en cualquier configuración, con o sin el paquete instalado.
 *
 * Es la superficie EXACTA que usa lib/extraerPdf.ts (getDocument →
 * numPages/getPage/getTextContent/destroy) — nada más, nada menos.
 */
declare module 'pdfjs-dist/legacy/build/pdf.mjs' {
  /** Item de texto del PDF (forma mínima que consume extraerPdf). */
  export interface PdfTextItem {
    str?: string;
    transform?: number[];
    width?: number;
  }
  export interface PdfTextContent {
    items: Array<PdfTextItem | { type: string }>;
  }
  export interface PdfPageProxy {
    getTextContent(): Promise<PdfTextContent>;
  }
  export interface PDFDocumentProxy {
    numPages: number;
    getPage(numeroPagina: number): Promise<PdfPageProxy>;
    destroy(): Promise<void>;
  }
  export interface DocumentInitParameters {
    data: Uint8Array;
    useSystemFonts?: boolean;
    isEvalSupported?: boolean;
  }
  export function getDocument(parametros: DocumentInitParameters): {
    promise: Promise<PDFDocumentProxy>;
  };
}
