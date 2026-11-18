import { DOCUMENT, inject, Service } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDF_VIEWER_CONFIG } from './config';
import { resolveAssetsRoot, resolveWorkerSrc } from './pdfjs-urls/pdfjs-urls';
import { toDocumentParams } from './source/source';
import { PdfSource } from './types';

type PdfJs = typeof import('pdfjs-dist');

export interface OpenDocumentOptions {
  readonly signal: AbortSignal;
  /** Download progress between 0 and 1, or `null` when the total size is unknown. */
  readonly onProgress?: (progress: number | null) => void;
}

/**
 * Thin wrapper around pdf.js. The library (~1 MB) is imported lazily, on the first
 * document load, so it never weighs on the application's initial bundle.
 */
@Service()
export class PdfEngine {
  private readonly config = inject(PDF_VIEWER_CONFIG);
  private readonly document = inject(DOCUMENT);
  private module: Promise<PdfJs> | null = null;

  /** Loads pdf.js once and configures its worker. */
  pdfjs(): Promise<PdfJs> {
    this.module ??= import('pdfjs-dist').then(
      (pdfjs) => {
        const workerOptions = pdfjs.GlobalWorkerOptions;
        if (!workerOptions.workerSrc && !workerOptions.workerPort) {
          workerOptions.workerSrc = resolveWorkerSrc(
            this.config.workerSrc,
            pdfjs.version,
            this.document.baseURI,
          );
        }
        return pdfjs;
      },
      (error: unknown) => {
        this.module = null; // allow a retry, e.g. after a network failure
        throw error;
      },
    );
    return this.module;
  }

  async open(
    source: PdfSource,
    { signal, onProgress }: OpenDocumentOptions,
  ): Promise<PDFDocumentProxy> {
    const [pdfjs, params] = await Promise.all([this.pdfjs(), toDocumentParams(source)]);
    signal.throwIfAborted();

    const task = pdfjs.getDocument({ ...params, ...this.assetParams(pdfjs.version) });
    if (onProgress) {
      task.onProgress = ({ loaded, total }: { loaded: number; total: number }) =>
        onProgress(total > 0 ? Math.min(1, loaded / total) : null);
    }
    const abort = () => void task.destroy();
    signal.addEventListener('abort', abort, { once: true });
    try {
      const pdf = await task.promise;
      if (signal.aborted) {
        // A newer source replaced this one while it was finishing: never leak it.
        await task.destroy();
        signal.throwIfAborted();
      }
      return pdf;
    } finally {
      signal.removeEventListener('abort', abort);
    }
  }

  private assetParams(version: string) {
    const root = resolveAssetsRoot(this.config.assetsUrl, version, this.document.baseURI);
    if (!root) {
      return {};
    }
    return {
      cMapUrl: `${root}cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${root}standard_fonts/`,
      wasmUrl: `${root}wasm/`,
      iccUrl: `${root}iccs/`,
    };
  }
}
