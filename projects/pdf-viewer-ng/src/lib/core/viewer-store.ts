import { isPlatformBrowser } from '@angular/common';
import {
  computed,
  effect,
  inject,
  Injectable,
  linkedSignal,
  PLATFORM_ID,
  resource,
  signal,
} from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { DEFAULT_PAGE_SIZE, resolveScale, Size } from '../utils/zoom';
import { classifyLoadError, PdfLoadErrorKind } from './errors';
import { PdfEngine } from './pdf-engine';
import { PdfInteractionTool, PdfSource, PdfZoom } from './types';

export type DocumentStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Above this page count, page sizes are measured lazily instead of prefetched. */
const PREFETCH_SIZES_MAX_PAGES = 1000;

/**
 * State of a single `<pdfv-viewer>` instance. Provided by the viewer component itself,
 * so several viewers on one page never share state.
 */
@Injectable()
export class ViewerStore {
  private readonly engine = inject(PdfEngine);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  // ---- Source & document ---------------------------------------------------------------

  /** Reactive getter of the viewer's `src` input, see `bindSource()`. */
  private readonly sourceBinding = signal<() => PdfSource | null | undefined>(() => null);

  /** Current source: follows the `src` input, and can be replaced from inside the viewer. */
  readonly source = linkedSignal<PdfSource | null>(() => this.sourceBinding()() ?? null);

  /** Download progress of the document being loaded (0..1), `null` when unknown. */
  readonly loadProgress = signal<number | null>(null);

  private readonly documentResource = resource({
    // No source, or server-side rendering: nothing to load.
    params: () => {
      const source = this.source();
      return this.isBrowser && source ? { source } : undefined;
    },
    loader: ({ params, abortSignal }) => {
      this.loadProgress.set(null);
      return this.engine.open(params.source, {
        signal: abortSignal,
        onProgress: (progress) => this.loadProgress.set(progress),
      });
    },
  });

  readonly document = computed<PDFDocumentProxy | null>(() =>
    this.documentResource.hasValue() ? this.documentResource.value() : null,
  );

  readonly status = computed<DocumentStatus>(() => {
    switch (this.documentResource.status()) {
      case 'loading':
      case 'reloading':
        return 'loading';
      case 'error':
        return 'error';
      default:
        return this.document() ? 'ready' : 'idle';
    }
  });

  readonly loadError = computed<unknown>(() => this.documentResource.error() ?? null);
  readonly loadErrorKind = computed<PdfLoadErrorKind | null>(() =>
    this.status() === 'error' ? classifyLoadError(this.loadError()) : null,
  );

  readonly pageCount = computed(() => this.document()?.numPages ?? 0);
  readonly hasDocument = computed(() => this.pageCount() > 0);

  // ---- Navigation, zoom & tools --------------------------------------------------------

  /** 1-based current page; back to 1 whenever a new document is loaded. */
  readonly currentPage = linkedSignal<PDFDocumentProxy | null, number>({
    source: this.document,
    computation: () => 1,
  });
  readonly canGoPrevious = computed(() => this.hasDocument() && this.currentPage() > 1);
  readonly canGoNext = computed(() => this.hasDocument() && this.currentPage() < this.pageCount());

  readonly zoom = signal<PdfZoom>('fit-width');
  readonly tool = signal<PdfInteractionTool>('select');
  readonly searchOpen = signal(false);

  /** Inner size of the scrollable document area, in CSS pixels. */
  readonly containerSize = signal<Size>({ width: 0, height: 0 });

  private readonly firstPage = resource({
    params: () => this.document() ?? undefined,
    loader: ({ params }) => params.getPage(1),
  });

  /** Size of the first page in PDF points: placeholder size of pages not loaded yet, and fit-zoom reference. */
  readonly referenceSize = computed<Size>(() => {
    if (!this.firstPage.hasValue()) {
      return DEFAULT_PAGE_SIZE;
    }
    const { width, height } = this.firstPage.value().getViewport({ scale: 1 });
    return { width, height };
  });

  /**
   * Sizes of all pages in PDF points, fetched in the background right after loading, so
   * placeholders have their final size and the layout never jumps while scrolling.
   * Skipped for very large documents, where each page measures itself when it first comes near.
   */
  private readonly pageSizesResource = resource({
    params: () => {
      const pdf = this.document();
      return pdf && pdf.numPages <= PREFETCH_SIZES_MAX_PAGES ? pdf : undefined;
    },
    loader: ({ params: pdf }) =>
      Promise.all(
        Array.from({ length: pdf.numPages }, (_, index) =>
          pdf.getPage(index + 1).then((page): Size => {
            const { width, height } = page.getViewport({ scale: 1 });
            return { width, height };
          }),
        ),
      ),
  });

  readonly pageSizes = computed<readonly Size[] | null>(() =>
    this.pageSizesResource.hasValue() ? this.pageSizesResource.value() : null,
  );

  /** Render scale: CSS pixels per PDF point. */
  readonly scale = computed(() => resolveScale(this.zoom(), this.referenceSize(), this.containerSize()));

  // ---- Announcements -------------------------------------------------------------------

  /** Latest message for the polite live region. */
  readonly announcement = signal('');

  constructor() {
    // Free the worker-side resources of every document once it is replaced or the viewer is destroyed.
    effect((onCleanup) => {
      const pdf = this.document();
      if (pdf) {
        onCleanup(() => void pdf.loadingTask.destroy());
      }
    });
  }

  /** Connects the viewer's `src` input to the store, without an effect. */
  bindSource(source: () => PdfSource | null | undefined): void {
    this.sourceBinding.set(source);
  }

  /** Loads the current source again, e.g. after a network error. */
  reload(): void {
    this.documentResource.reload();
  }

  setTool(tool: PdfInteractionTool): void {
    this.tool.set(tool);
  }

  announce(message: string): void {
    this.announcement.set(message);
  }
}
