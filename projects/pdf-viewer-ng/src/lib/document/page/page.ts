import {
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  linkedSignal,
  resource,
  signal,
  viewChild,
} from '@angular/core';
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { PDF_VIEWER_CONFIG } from '../../core/config';
import { PDF_VIEWER_MESSAGES } from '../../core/messages';
import { ViewerStore } from '../../core/viewer-store/viewer-store';
import { canvasPixelRatio, Size } from '../../utils/zoom/zoom';
import { SearchStore } from '../../search/search-store';
import { DocumentView } from '../document-view/document-view';
import { AnnotationLayer } from '../../annotations/annotation-layer/annotation-layer';
import { LinkLayer } from '../link-layer/link-layer';
import { TextLayer } from '../text-layer/text-layer';

/** Delay before re-rendering a page that already shows a (stretched) canvas, e.g. while zooming or resizing. */
const RERENDER_DELAY_MS = 120;

interface PageSize extends Size {
  /** `true` once measured from the page itself, `false` while estimated from the first page. */
  readonly exact: boolean;
}

/**
 * One PDF page. Sized from the start (so the scrollbar is right), but it only fetches,
 * renders and keeps a canvas while it is near the visible area.
 */
@Component({
  selector: 'pdfv-page',
  imports: [TextLayer, LinkLayer, AnnotationLayer],
  templateUrl: './page.html',
  styleUrl: './page.scss',
  host: {
    role: 'group',
    '[attr.aria-label]': 'label()',
    '[attr.data-page-number]': 'pageNumber()',
    '[style.inline-size.px]': 'cssSize().width',
    '[style.block-size.px]': 'cssSize().height',
    // Read by the pdf.js text layer to position and size its text runs.
    '[style.--total-scale-factor]': 'scale()',
    '[style.--scale-round-x]': "'1px'",
    '[style.--scale-round-y]': "'1px'",
  },
})
export class Page {
  readonly pageNumber = input.required<number>();

  private readonly store = inject(ViewerStore);
  private readonly documentView = inject(DocumentView);
  private readonly config = inject(PDF_VIEWER_CONFIG);
  private readonly messages = inject(PDF_VIEWER_MESSAGES);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly canvasHost = viewChild.required<ElementRef<HTMLElement>>('canvasHost');

  protected readonly near = computed(() => this.documentView.nearPages().has(this.pageNumber()));
  protected readonly renderFailed = signal(false);
  protected readonly label = computed(() =>
    this.messages.pageLabel(this.pageNumber(), this.store.pageCount()),
  );
  protected readonly errorText = this.messages.pageRenderError;

  private readonly pageResource = resource({
    params: () => {
      const pdf = this.store.document();
      return pdf && this.near() ? { pdf, pageNumber: this.pageNumber() } : undefined;
    },
    loader: ({ params }) => params.pdf.getPage(params.pageNumber),
  });

  protected readonly scale = computed(() => this.store.scale());

  private readonly search = inject(SearchStore);
  /** Search matches on this page, and the index of the current one (-1 when elsewhere). */
  protected readonly matches = computed(() => this.search.pageMatches().get(this.pageNumber()));
  protected readonly selectedMatch = computed(() => {
    const current = this.search.current();
    return current?.page === this.pageNumber() ? current.index : -1;
  });

  protected readonly page = computed<PDFPageProxy | null>(() =>
    this.pageResource.hasValue() ? this.pageResource.value() : null,
  );

  /**
   * Exact size from the prefetched sizes or from the page itself once loaded,
   * the first page size until then.
   */
  private readonly size = linkedSignal<
    {
      pdf: unknown;
      pageNumber: number;
      page: PDFPageProxy | null;
      known: Size | undefined;
      reference: Size;
    },
    PageSize
  >({
    source: () => ({
      pdf: this.store.document(),
      pageNumber: this.pageNumber(),
      page: this.page(),
      known: this.store.pageSizes()?.[this.pageNumber() - 1],
      reference: this.store.referenceSize(),
    }),
    computation: (source, previous) => {
      if (source.known) {
        return { ...source.known, exact: true };
      }
      if (source.page) {
        const { width, height } = source.page.getViewport({ scale: 1 });
        return { width, height, exact: true };
      }
      const samePage =
        previous !== undefined &&
        previous.source.pdf === source.pdf &&
        previous.source.pageNumber === source.pageNumber;
      if (previous?.value.exact && samePage) {
        return previous.value;
      }
      return { ...source.reference, exact: false };
    },
  });

  protected readonly cssSize = computed<Size>(() => {
    const scale = this.store.scale();
    const { width, height } = this.size();
    return { width: Math.floor(width * scale), height: Math.floor(height * scale) };
  });

  private canvas: HTMLCanvasElement | null = null;

  constructor() {
    // Re-registers when the page number changes (single page mode reuses this component).
    afterRenderEffect(() => this.documentView.observe(this.host, this.pageNumber()));
    inject(DestroyRef).onDestroy(() => {
      this.documentView.unobserve(this.host);
      this.releaseCanvas();
    });

    afterRenderEffect((onCleanup) => {
      const page = this.page();
      const scale = this.store.scale();
      if (!page || !this.near()) {
        // Also reached when the page number changes: the previous page is never shown stretched.
        this.releaseCanvas();
        return;
      }

      let task: RenderTask | null = null;
      let cancelled = false;
      const timer = setTimeout(
        () => {
          task = this.render(page, scale);
          this.renderFailed.set(false);
          task.promise.then(
            () => undefined,
            (error: unknown) => {
              if (
                !cancelled &&
                (error as { name?: string })?.name !== 'RenderingCancelledException'
              ) {
                this.renderFailed.set(true);
              }
            },
          );
        },
        this.canvas ? RERENDER_DELAY_MS : 0,
      );

      onCleanup(() => {
        cancelled = true;
        clearTimeout(timer);
        task?.cancel();
      });
    });
  }

  /**
   * Renders into a fresh canvas and swaps it in only when complete, so the previous
   * (CSS-stretched) rendering stays visible meanwhile: no blank flash while zooming.
   */
  private render(page: PDFPageProxy, scale: number): RenderTask {
    const viewport = page.getViewport({ scale });
    const ratio = canvasPixelRatio(
      viewport,
      globalThis.devicePixelRatio ?? 1,
      this.config.maxPixelRatio,
    );
    const canvas = this.host.ownerDocument.createElement('canvas');
    canvas.width = Math.floor(viewport.width * ratio);
    canvas.height = Math.floor(viewport.height * ratio);
    canvas.setAttribute('aria-hidden', 'true');
    // Inline styles: created outside Angular templates, the canvas cannot get encapsulated styles.
    canvas.style.cssText = 'display:block;inline-size:100%;block-size:100%';

    const task = page.render({
      canvas,
      viewport,
      transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
    });
    task.promise.then(
      () => {
        const previous = this.canvas;
        this.canvas = canvas;
        this.canvasHost().nativeElement.replaceChildren(canvas);
        freeCanvas(previous);
      },
      () => freeCanvas(canvas),
    );
    return task;
  }

  /** Drops the canvas of a page far from view: canvases are the main memory cost. */
  private releaseCanvas(): void {
    if (!this.canvas) {
      return;
    }
    this.canvas.remove();
    freeCanvas(this.canvas);
    this.canvas = null;
  }
}

/** Shrinking a canvas releases its backing store immediately (notably on iOS Safari). */
function freeCanvas(canvas: HTMLCanvasElement | null): void {
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
}
