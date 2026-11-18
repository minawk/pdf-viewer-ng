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
  untracked,
} from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  clampZoom,
  DEFAULT_PAGE_SIZE,
  MAX_ZOOM,
  MIN_ZOOM,
  PDF_TO_CSS_UNITS,
  resolveScale,
  Size,
  stepZoom,
  zoomPercent,
} from '../utils/zoom';
import { classifyLoadError, PdfLoadErrorKind } from './errors';
import { PdfEngine } from './pdf-engine';
import { PDF_VIEWER_CONFIG } from './config';
import { PDF_VIEWER_MESSAGES } from './messages';
import { PdfInteractionTool, PdfPageMode, PdfSource, PdfZoom } from './types';

export type DocumentStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Viewer inputs the store depends on, as reactive getters. */
export interface ViewerInputs {
  readonly src: () => PdfSource | null | undefined;
  readonly pageMode: () => PdfPageMode | undefined;
  readonly zoom: () => PdfZoom | undefined;
}

/** Which edge of the target page to bring into view. */
export type ScrollPosition = 'start' | 'end';

/** A navigation the document view must perform. A new object every time, so repeats are honored. */
export interface ScrollRequest {
  readonly page: number;
  readonly position: ScrollPosition;
}

/** Above this page count, page sizes are measured lazily instead of prefetched. */
const PREFETCH_SIZES_MAX_PAGES = 1000;

/**
 * State of a single `<pdfv-viewer>` instance. Provided by the viewer component itself,
 * so several viewers on one page never share state.
 */
@Injectable()
export class ViewerStore {
  private readonly engine = inject(PdfEngine);
  private readonly config = inject(PDF_VIEWER_CONFIG);
  private readonly messages = inject(PDF_VIEWER_MESSAGES);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  /** Reactive getters of the viewer inputs, see `connect()`. */
  private readonly inputs = signal<ViewerInputs>({
    src: () => null,
    pageMode: () => undefined,
    zoom: () => undefined,
  });

  // ---- Source & document ---------------------------------------------------------------

  /** Current source: follows the `src` input, and can be replaced from inside the viewer. */
  readonly source = linkedSignal<PdfSource | null>(() => this.inputs().src() ?? null);

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

  // ---- Navigation ----------------------------------------------------------------------

  readonly pageMode = computed<PdfPageMode>(() => this.inputs().pageMode() ?? this.config.pageMode);

  /** Page requested before its document was ready, e.g. `[page]="5"` set along with `src`. */
  private readonly pendingPage = signal<number | null>(null);

  /**
   * 1-based current page. Each new document opens at the pending page if one was requested,
   * at page 1 otherwise.
   */
  readonly currentPage = linkedSignal<PDFDocumentProxy | null, number>({
    source: this.document,
    computation: (pdf) => (pdf ? clampPage(untracked(this.pendingPage) ?? 1, pdf.numPages) : 1),
  });
  readonly canGoPrevious = computed(() => this.hasDocument() && this.currentPage() > 1);
  readonly canGoNext = computed(() => this.hasDocument() && this.currentPage() < this.pageCount());

  /** Latest navigation for the document view to scroll to. */
  readonly scrollRequest = signal<ScrollRequest | null>(null);

  // ---- Zoom & tools --------------------------------------------------------------------

  /** Zoom setting: follows the `zoom` input, and changes with the toolbar, keyboard, wheel and pinch. */
  readonly zoom = linkedSignal<PdfZoom>(() => this.inputs().zoom() ?? this.config.zoom);
  readonly tool = signal<PdfInteractionTool>('select');
  readonly searchOpen = signal(false);

  /** Inner size of the scrollable document area, in CSS pixels. */
  readonly containerSize = signal<Size>({ width: 0, height: 0 });

  private readonly firstPageResource = resource({
    params: () => this.document() ?? undefined,
    loader: ({ params }) => params.getPage(1),
  });

  /** Size of the first page in PDF points: placeholder size of pages not loaded yet, and fit-zoom reference. */
  readonly referenceSize = computed<Size>(() => {
    if (!this.firstPageResource.hasValue()) {
      return DEFAULT_PAGE_SIZE;
    }
    const { width, height } = this.firstPageResource.value().getViewport({ scale: 1 });
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

  /**
   * Page that fit-to-width / fit-to-page adapt to. Continuous mode: the first page, so scrolling
   * through pages of mixed sizes never changes the zoom. Single mode: the displayed page.
   */
  private readonly fitReferenceSize = computed<Size>(() => {
    if (this.pageMode() === 'single') {
      return this.pageSizes()?.[this.currentPage() - 1] ?? this.referenceSize();
    }
    return this.referenceSize();
  });

  /** Render scale: CSS pixels per PDF point. */
  readonly scale = computed(() => resolveScale(this.zoom(), this.fitReferenceSize(), this.containerSize()));

  /** Zoom actually applied, as a factor of the actual size (1 = 100%), fit modes included. */
  readonly effectiveZoom = computed(() => this.scale() / PDF_TO_CSS_UNITS);
  readonly canZoomIn = computed(() => this.hasDocument() && this.effectiveZoom() < MAX_ZOOM - 0.001);
  readonly canZoomOut = computed(() => this.hasDocument() && this.effectiveZoom() > MIN_ZOOM + 0.001);

  // ---- Announcements -------------------------------------------------------------------

  /** Latest message for the polite live region. */
  readonly announcement = signal('');

  constructor() {
    effect((onCleanup) => {
      const pdf = this.document();
      if (!pdf) {
        return;
      }
      untracked(() => {
        // Resolve the opening page (consuming the pending one) and bring it into view.
        const page = this.currentPage();
        this.pendingPage.set(null);
        if (page > 1) {
          this.scrollRequest.set({ page, position: 'start' });
        }
      });
      // Free the worker-side resources of every document once it is replaced or the viewer is destroyed.
      onCleanup(() => void pdf.loadingTask.destroy());
    });
  }

  /** Connects the viewer inputs to the store, without effects. */
  connect(inputs: ViewerInputs): void {
    this.inputs.set(inputs);
  }

  /**
   * Navigates to a page (clamped to the document) and announces it. Before the document
   * is ready, the page is remembered and the document opens there.
   */
  goToPage(page: number, position: ScrollPosition = 'start'): void {
    const pdf = this.document();
    if (!pdf) {
      this.pendingPage.set(page);
      return;
    }
    const target = clampPage(page, pdf.numPages);
    this.currentPage.set(target);
    this.scrollRequest.set({ page: target, position });
    this.announce(this.messages.pageLabel(target, pdf.numPages));
  }

  firstPage(): void {
    this.goToPage(1);
  }

  previousPage(position: ScrollPosition = 'start'): void {
    this.goToPage(this.currentPage() - 1, position);
  }

  nextPage(): void {
    this.goToPage(this.currentPage() + 1);
  }

  lastPage(): void {
    this.goToPage(this.pageCount());
  }

  /** Records the page the user scrolled to: no scrolling, no announcement. */
  setVisiblePage(page: number): void {
    this.currentPage.set(clampPage(page, this.pageCount()));
  }

  /** Loads the current source again, e.g. after a network error. */
  reload(): void {
    this.documentResource.reload();
  }

  /** Sets the zoom, from the toolbar or the keyboard, and announces the resulting level. */
  setZoom(zoom: PdfZoom): void {
    this.zoom.set(typeof zoom === 'number' ? clampZoom(zoom) : zoom);
    const level =
      zoom === 'fit-width'
        ? this.messages.fitWidth
        : zoom === 'fit-page'
          ? this.messages.fitPage
          : this.messages.zoomPercent(zoomPercent(this.effectiveZoom()));
    this.announce(this.messages.zoomChanged(level));
  }

  zoomIn(): void {
    this.setZoom(stepZoom(this.effectiveZoom(), 1));
  }

  zoomOut(): void {
    this.setZoom(stepZoom(this.effectiveZoom(), -1));
  }

  /** Continuous zoom (wheel, pinch): relative to the current level, not announced. */
  zoomBy(factor: number): void {
    this.zoom.set(clampZoom(this.effectiveZoom() * factor));
  }

  setTool(tool: PdfInteractionTool): void {
    this.tool.set(tool);
  }

  /** Updates the live region. A repeated message is altered invisibly so it is announced again. */
  announce(message: string): void {
    const current = this.announcement();
    this.announcement.set(current === message ? `${message}\u00a0` : message);
  }
}

function clampPage(page: number, pageCount: number): number {
  if (!Number.isFinite(page)) {
    return 1;
  }
  return Math.min(Math.max(1, Math.trunc(page)), Math.max(1, pageCount));
}
