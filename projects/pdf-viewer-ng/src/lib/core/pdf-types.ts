import type { PDFPageProxy } from 'pdfjs-dist';

/** Text content of a page, derived from the public pdf.js API (no deep import of its internals). */
export type PdfTextContent = Awaited<ReturnType<PDFPageProxy['getTextContent']>>;
