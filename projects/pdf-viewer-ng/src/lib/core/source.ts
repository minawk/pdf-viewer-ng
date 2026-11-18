import { PdfSource } from './types';

export type PdfDocumentParams = { readonly url: string } | { readonly data: Uint8Array };

/**
 * Converts a viewer source into `getDocument()` parameters.
 * Binary data is copied, because pdf.js transfers (detaches) the buffer it receives
 * to its worker, and the caller's buffer must stay usable.
 */
export async function toDocumentParams(source: PdfSource): Promise<PdfDocumentParams> {
  if (typeof source === 'string' || source instanceof URL) {
    return { url: source.toString() };
  }
  if (source instanceof Blob) {
    return { data: new Uint8Array(await source.arrayBuffer()) };
  }
  if (source instanceof ArrayBuffer) {
    return { data: new Uint8Array(source.slice(0)) };
  }
  return { data: source.slice() };
}
