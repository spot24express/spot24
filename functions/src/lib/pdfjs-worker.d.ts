/**
 * SPOT 24 · Declaración de tipos del worker de pdfjs-dist (5.87b).
 * pdfjs-dist publica tipos para pdf.mjs (pdf.d.mts) pero NO para
 * pdf.worker.mjs (no existe pdf.worker.d.mts): sin esta declaración, el
 * import del worker en lib/extraerPdf.ts no compila con strict + nodenext.
 */
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
