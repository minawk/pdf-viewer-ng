import { DOCUMENT, inject, Injectable, signal } from '@angular/core';
import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { PDF_VIEWER_CONFIG } from '../core/config';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { PdfEngine } from '../core/pdf-engine';
import { ViewerStore } from '../core/viewer-store/viewer-store';
import { canvasPixelRatio, Size } from '../utils/zoom/zoom';

export interface PrintProgress {
  readonly done: number;
  readonly total: number;
}

interface PrintPage extends Size {
  /** Object URL of the rendered page image. */
  readonly url: string;
}

/** Longest wait for the end of printing when the browser does not report it. */
const PRINT_CLEANUP_TIMEOUT_MS = 60_000;

/**
 * Prints the whole document, whatever is rendered on screen: every page is rendered at print
 * resolution to an image, then the images are printed from a hidden frame, one per sheet,
 * each sheet with the size and orientation of its page. The application's own print styles
 * are never involved.
 */
@Injectable()
export class PrintService {
  private readonly store = inject(ViewerStore);
  private readonly engine = inject(PdfEngine);
  private readonly config = inject(PDF_VIEWER_CONFIG);
  private readonly messages = inject(PDF_VIEWER_MESSAGES);
  private readonly document = inject(DOCUMENT);

  /** Preparation progress, `null` when not preparing a print. */
  readonly progress = signal<PrintProgress | null>(null);
  private controller: AbortController | null = null;

  async print(): Promise<void> {
    const pdf = this.store.document();
    if (!pdf || this.controller) {
      return;
    }
    const controller = new AbortController();
    this.controller = controller;
    const urls: string[] = [];
    let handedOver = false;
    this.progress.set({ done: 0, total: pdf.numPages });
    this.store.announce(this.messages.printPreparing);
    try {
      const pages = await this.renderPages(pdf, controller.signal, urls);
      this.progress.set(null);
      this.store.announce(this.messages.printReady);
      handedOver = true;
      // The print frame frees the images itself once printing is over.
      await printImages(this.document, pages, () => urls.forEach((url) => URL.revokeObjectURL(url)));
    } catch (error) {
      if (controller.signal.aborted) {
        this.store.announce(this.messages.printCancelled);
      } else {
        console.error('[pdf-viewer-ng] Printing failed', error);
        this.store.announce(this.messages.printFailed);
      }
    } finally {
      if (!handedOver) {
        urls.forEach((url) => URL.revokeObjectURL(url));
      }
      this.progress.set(null);
      this.controller = null;
    }
  }

  cancel(): void {
    this.controller?.abort();
  }

  private async renderPages(pdf: PDFDocumentProxy, signal: AbortSignal, urls: string[]): Promise<PrintPage[]> {
    const pdfjs = await this.engine.pdfjs();
    const dpiScale = this.config.printResolution / 72;
    const pages: PrintPage[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      signal.throwIfAborted();
      const page = await pdf.getPage(pageNumber);
      const size = page.getViewport({ scale: 1 });
      // Very large pages are printed at a lower resolution rather than exceeding canvas limits.
      const scale = canvasPixelRatio(size, dpiScale, dpiScale);
      const viewport = page.getViewport({ scale });
      const canvas = this.document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);

      const task: RenderTask = page.render({
        canvas,
        viewport,
        intent: 'print',
        // Annotations and form values as edited, like the pdf.js viewer.
        annotationMode: pdfjs.AnnotationMode.ENABLE_STORAGE,
        printAnnotationStorage: pdf.annotationStorage.print,
      });
      const cancelRender = () => task.cancel();
      signal.addEventListener('abort', cancelRender, { once: true });
      try {
        await task.promise;
      } finally {
        signal.removeEventListener('abort', cancelRender);
      }
      const blob = await canvasToBlob(canvas);
      canvas.width = canvas.height = 0;
      page.cleanup();

      const url = URL.createObjectURL(blob);
      urls.push(url);
      pages.push({ url, width: size.width, height: size.height });
      this.progress.set({ done: pageNumber, total: pdf.numPages });
    }
    signal.throwIfAborted();
    return pages;
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Canvas export failed'))), 'image/png'),
  );
}

/**
 * Prints page images from a hidden frame, one per sheet, sized in points. Resolves once the
 * print dialog was requested; the frame is removed (and `onFinished` called) after printing.
 */
async function printImages(document: Document, pages: readonly PrintPage[], onFinished: () => void): Promise<void> {
  // A named @page per distinct page size, so mixed portrait/landscape documents print correctly.
  const pageNames = new Map<string, string>();
  const css = [
    '@page { margin: 0; }',
    'html, body { margin: 0; padding: 0; }',
    'img { display: block; break-after: page; }',
    'img:last-child { break-after: auto; }',
  ];
  const images = pages.map((page) => {
    const key = `${page.width}x${page.height}`;
    let name = pageNames.get(key);
    if (!name) {
      name = `pdfv${pageNames.size}`;
      pageNames.set(key, name);
      css.push(`@page ${name} { size: ${page.width}pt ${page.height}pt; margin: 0; }`);
    }
    return `<img src="${page.url}" alt="" style="page: ${name}; width: ${page.width}pt; height: ${page.height}pt">`;
  });

  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  // Not display:none nor visibility:hidden: some browsers then print a blank page.
  frame.style.cssText = 'position:fixed;inset-inline-end:0;inset-block-end:0;width:0;height:0;border:0;';
  const loaded = new Promise<void>((resolve) => frame.addEventListener('load', () => resolve(), { once: true }));
  frame.srcdoc = `<!doctype html><html><head><title>${escapeHtml(document.title)}</title><style>${css.join('\n')}</style></head><body>${images.join('')}</body></html>`;
  document.body.append(frame);
  let cleaned = false;
  const cleanup = () => {
    if (!cleaned) {
      cleaned = true;
      frame.remove();
      onFinished();
    }
  };
  try {
    await loaded;
    const frameWindow = frame.contentWindow;
    if (!frameWindow) {
      throw new Error('Print frame unavailable');
    }
    await Promise.all(Array.from(frameWindow.document.images, (image) => image.decode()));
    // Browsers with a blocking print() fire `afterprint` before it returns; the others later.
    frameWindow.addEventListener('afterprint', () => setTimeout(cleanup), { once: true });
    setTimeout(cleanup, PRINT_CLEANUP_TIMEOUT_MS);
    frameWindow.focus();
    frameWindow.print();
  } catch (error) {
    cleanup();
    throw error;
  }
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"]/g, (char) => `&#${char.charCodeAt(0)};`);
}
