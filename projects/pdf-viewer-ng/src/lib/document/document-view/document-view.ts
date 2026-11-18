import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { AnnotationStore } from '../../annotations/annotation-store/annotation-store';
import { PDF_VIEWER_MESSAGES } from '../../core/messages';
import { ScrollPosition, ViewerStore } from '../../core/viewer-store/viewer-store';
import { PAGE_GAP } from '../../utils/zoom/zoom';
import { attachGestures, ViewportPoint } from '../gestures';
import { Page } from '../page/page';
import { TextSelection } from '../text-selection';

/**
 * A point of the document pinned to a point of the viewport, so the reading position
 * survives zoom and layout changes.
 */
interface ScrollAnchor {
  readonly page: number;
  /** Position of the anchored document point in the page, as fractions of the page size. */
  readonly ratioX: number;
  readonly ratioY: number;
  /** Where that document point is in the viewport, in CSS pixels. */
  readonly viewport: ViewportPoint;
}

/**
 * Scrollable document area.
 * - Virtualization: one IntersectionObserver tells which pages are near the visible area,
 *   so only those get a canvas.
 * - Navigation: scrolls to the pages requested through the store.
 * - Continuous mode: the current page follows scrolling.
 * - Single mode: renders the current page only; the keyboard moves between pages.
 */
@Component({
  selector: 'pdfv-document-view',
  imports: [Page],
  providers: [TextSelection],
  templateUrl: './document-view.html',
  styleUrl: './document-view.scss',
  host: {
    role: 'region',
    tabindex: '0',
    '[attr.aria-label]': 'messages.documentLabel',
    '[attr.aria-busy]': "store.status() === 'loading'",
    '[attr.data-page-mode]': 'store.pageMode()',
    '[class.pan]': "store.tool() === 'pan'",
    '(pointerup)': 'onPointerUp()',
    '[style.--pdfv-page-gap.px]': 'pageGap',
    '(keydown)': 'onKeydown($event)',
  },
})
export class DocumentView {
  protected readonly store = inject(ViewerStore);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);
  protected readonly pageGap = PAGE_GAP;
  private readonly annotations = inject(AnnotationStore);

  /** Pages intersecting the visible area extended by one screen above and below. */
  readonly nearPages = signal<ReadonlySet<number>>(new Set());

  /** Pages present in the DOM: all of them in continuous mode, the current one in single mode. */
  protected readonly renderedPages = computed<readonly number[]>(() =>
    this.store.pageMode() === 'single'
      ? [this.store.currentPage()]
      : Array.from({ length: this.store.pageCount() }, (_, index) => index + 1),
  );

  protected readonly progressPercent = computed(() => {
    const progress = this.store.loadProgress();
    return progress === null ? null : Math.round(progress * 100);
  });

  protected readonly errorMessage = computed(() => {
    const kind = this.store.loadErrorKind();
    return kind ? this.messages.loadErrors[kind] : '';
  });

  protected readonly canRetry = computed(() => {
    const kind = this.store.loadErrorKind();
    return kind === 'missing' || kind === 'unknown';
  });

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly observed = new Map<Element, number>();
  private intersectionObserver: IntersectionObserver | null = null;

  private anchor: ScrollAnchor | null = null;
  private anchorDocument: unknown = null;
  /** Target of the last programmatic scroll: its scroll event must not move the current page. */
  private expectedScrollTop: number | null = null;
  private scrollFrame = 0;

  constructor() {
    const destroyRef = inject(DestroyRef);

    afterNextRender(() => {
      if (typeof ResizeObserver !== 'undefined') {
        const resizeObserver = new ResizeObserver(() => this.measure());
        resizeObserver.observe(this.host);
        destroyRef.onDestroy(() => resizeObserver.disconnect());
      }
      this.measure();

      if (typeof IntersectionObserver !== 'undefined') {
        this.intersectionObserver = new IntersectionObserver(
          (entries) => this.onIntersect(entries),
          {
            root: this.host,
            rootMargin: '100% 0px',
          },
        );
        this.observed.forEach((_, element) => this.intersectionObserver?.observe(element));
        destroyRef.onDestroy(() => this.intersectionObserver?.disconnect());
      }

      // A plain listener: scrolling must not trigger change detection unless the page changes.
      const onScroll = () => {
        cancelAnimationFrame(this.scrollFrame);
        this.scrollFrame = requestAnimationFrame(() => this.onScrolled());
      };
      this.host.addEventListener('scroll', onScroll, { passive: true });
      destroyRef.onDestroy(() => {
        this.host.removeEventListener('scroll', onScroll);
        cancelAnimationFrame(this.scrollFrame);
      });

      const detachGestures = attachGestures(this.host, {
        active: () => this.store.hasDocument(),
        panEnabled: () => this.store.tool() === 'pan',
        zoom: (factor, point) => {
          // Pin the document point under the pointer, then zoom: the anchor effect restores it.
          this.anchor = this.readAnchor(point);
          this.store.zoomBy(factor);
        },
      });
      destroyRef.onDestroy(detachGestures);
    });

    // Keep the reading position when the layout changes: zoom, resize, page sizes, page mode.
    afterRenderEffect(() => {
      const pdf = this.store.document();
      this.store.scale();
      this.store.pageSizes();
      this.store.pageMode();
      untracked(() => {
        if (pdf !== this.anchorDocument) {
          // A new document never inherits the previous reading position.
          this.anchorDocument = pdf;
          this.anchor = null;
        }
        this.restoreAnchor();
      });
    });

    // Navigation requested through the store (pager, keyboard, `[(page)]`).
    afterRenderEffect(() => {
      const request = this.store.scrollRequest();
      if (request) {
        untracked(() => this.scrollToPage(request.page, request.position));
      }
    });
  }

  /** Called by each page to take part in virtualization, again when its page number changes. */
  observe(element: Element, pageNumber: number): void {
    const previous = this.observed.get(element);
    if (previous === pageNumber) {
      return;
    }
    if (previous !== undefined) {
      // Observing again yields a fresh intersection entry for the new page number.
      this.unobserve(element);
    }
    this.observed.set(element, pageNumber);
    this.intersectionObserver?.observe(element);
  }

  unobserve(element: Element): void {
    const pageNumber = this.observed.get(element);
    this.observed.delete(element);
    this.intersectionObserver?.unobserve(element);
    if (pageNumber !== undefined) {
      this.nearPages.update((pages) => withPage(pages, pageNumber, false));
    }
  }

  /** Highlight tool: releasing the pointer after selecting text highlights it. */
  protected onPointerUp(): void {
    if (this.store.tool() === 'highlight') {
      // After the browser has finalized the selection.
      setTimeout(() => this.annotations.highlightSelection());
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    // Only when the document area itself has focus: never steal keys from inner controls.
    if (
      event.target !== this.host ||
      event.altKey ||
      event.ctrlKey ||
      event.metaKey ||
      !this.store.hasDocument()
    ) {
      return;
    }
    const single = this.store.pageMode() === 'single';
    const { scrollTop, scrollHeight, clientHeight, scrollWidth, clientWidth } = this.host;
    const atTop = scrollTop <= 1;
    const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
    const noHorizontalScroll = scrollWidth <= clientWidth;

    switch (event.key) {
      case 'Home':
        this.store.firstPage();
        break;
      case 'End':
        this.store.lastPage();
        break;
      // Single mode: page keys scroll within a tall page first, then turn the page.
      case 'PageDown':
        if (!single || !atBottom) return;
        this.store.nextPage();
        break;
      case 'PageUp':
        if (!single || !atTop) return;
        this.store.previousPage('end');
        break;
      case 'ArrowRight':
        if (!single || !noHorizontalScroll) return;
        this.store.nextPage();
        break;
      case 'ArrowLeft':
        if (!single || !noHorizontalScroll) return;
        this.store.previousPage();
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  private onIntersect(entries: IntersectionObserverEntry[]): void {
    this.nearPages.update((pages) => {
      let next = pages;
      for (const entry of entries) {
        const pageNumber = this.observed.get(entry.target);
        if (pageNumber !== undefined) {
          next = withPage(next, pageNumber, entry.isIntersecting);
        }
      }
      return next;
    });
  }

  private onScrolled(): void {
    const programmatic =
      this.expectedScrollTop !== null &&
      Math.abs(this.host.scrollTop - this.expectedScrollTop) <= 1;
    this.expectedScrollTop = null;
    this.anchor = this.readAnchor();
    if (!programmatic && this.store.pageMode() === 'continuous') {
      const page = this.mostVisiblePage();
      if (page !== null && page !== this.store.currentPage()) {
        this.store.setVisiblePage(page);
      }
    }
  }

  private scrollToPage(page: number, position: ScrollPosition): void {
    const element = this.pageElement(page);
    if (!element) {
      return;
    }
    if (position === 'nearest') {
      const { scrollTop, clientHeight } = this.host;
      const visible =
        element.offsetTop < scrollTop + clientHeight &&
        element.offsetTop + element.offsetHeight > scrollTop;
      if (visible) {
        return;
      }
    }
    const top =
      position === 'end'
        ? element.offsetTop + element.offsetHeight + PAGE_GAP - this.host.clientHeight
        : element.offsetTop - PAGE_GAP;
    this.setScroll(this.host.scrollLeft, top);
    this.anchor = this.readAnchor();
  }

  /**
   * Scrolls the least needed to show an element of a page (e.g. a search result), centered
   * in each direction where it is out of view.
   */
  reveal(element: HTMLElement): void {
    const view = this.host.getBoundingClientRect();
    const rect = element.getBoundingClientRect();
    const top = rect.top - view.top - this.host.clientTop;
    const left = rect.left - view.left - this.host.clientLeft;
    const { clientWidth, clientHeight, scrollLeft, scrollTop } = this.host;
    const outVertically = top < 0 || top + rect.height > clientHeight;
    const outHorizontally = left < 0 || left + rect.width > clientWidth;
    this.setScroll(
      outHorizontally ? scrollLeft + left - (clientWidth - rect.width) / 2 : scrollLeft,
      outVertically ? scrollTop + top - (clientHeight - rect.height) / 2 : scrollTop,
    );
    this.anchor = this.readAnchor();
  }

  private restoreAnchor(): void {
    const anchor = this.anchor;
    const element = anchor && this.pageElement(anchor.page);
    if (!anchor || !element) {
      // First layout: start tracking from here.
      this.anchor = this.readAnchor();
      return;
    }
    this.setScroll(
      element.offsetLeft + anchor.ratioX * element.offsetWidth - anchor.viewport.x,
      element.offsetTop + anchor.ratioY * element.offsetHeight - anchor.viewport.y,
    );
  }

  /**
   * Reads which document point is at a viewport point; by default the top center of the
   * viewport, so zooming with the toolbar keeps the top of the reading position and the
   * horizontal center.
   */
  private readAnchor(
    point: ViewportPoint = { x: this.host.clientWidth / 2, y: 0 },
  ): ScrollAnchor | null {
    const pages = this.pageElements();
    if (pages.length === 0) {
      return null;
    }
    const y = this.host.scrollTop + point.y;
    const element = pages[Math.min(firstPageEndingAfter(pages, y), pages.length - 1)];
    return {
      page: Number(element.dataset['pageNumber']),
      ratioX: (this.host.scrollLeft + point.x - element.offsetLeft) / (element.offsetWidth || 1),
      ratioY: (y - element.offsetTop) / (element.offsetHeight || 1),
      viewport: point,
    };
  }

  /** The page taking the most room in the viewport; the first/last page at the very top/bottom. */
  private mostVisiblePage(): number | null {
    const pages = this.pageElements();
    if (pages.length === 0) {
      return null;
    }
    const { scrollTop, clientHeight, scrollHeight } = this.host;
    if (scrollTop <= 1) {
      return Number(pages[0].dataset['pageNumber']);
    }
    if (scrollTop + clientHeight >= scrollHeight - 1) {
      return Number(pages[pages.length - 1].dataset['pageNumber']);
    }
    const viewBottom = scrollTop + clientHeight;
    let best: number | null = null;
    let bestVisible = 0;
    for (let index = firstPageEndingAfter(pages, scrollTop); index < pages.length; index++) {
      const element = pages[index];
      const top = element.offsetTop;
      if (top >= viewBottom) {
        break;
      }
      const visible = Math.min(top + element.offsetHeight, viewBottom) - Math.max(top, scrollTop);
      if (visible > bestVisible) {
        bestVisible = visible;
        best = Number(element.dataset['pageNumber']);
      }
    }
    return best;
  }

  private setScroll(left: number, top: number): void {
    const { scrollWidth, scrollHeight, clientWidth, clientHeight } = this.host;
    const targetLeft = Math.round(
      Math.min(Math.max(0, left), Math.max(0, scrollWidth - clientWidth)),
    );
    const targetTop = Math.round(
      Math.min(Math.max(0, top), Math.max(0, scrollHeight - clientHeight)),
    );
    const moveTop = Math.abs(this.host.scrollTop - targetTop) >= 1;
    if (moveTop || Math.abs(this.host.scrollLeft - targetLeft) >= 1) {
      if (moveTop) {
        this.expectedScrollTop = targetTop;
      }
      // Instant, even under `scroll-behavior: smooth`; also aborts an ongoing smooth scroll
      // (e.g. a keyboard PageDown still animating when the page is turned).
      this.host.scrollTo({ left: targetLeft, top: targetTop, behavior: 'instant' });
    }
  }

  private pageElements(): HTMLElement[] {
    return Array.from(this.host.querySelectorAll<HTMLElement>(':scope > pdfv-page'));
  }

  private pageElement(page: number): HTMLElement | null {
    return this.host.querySelector<HTMLElement>(`:scope > pdfv-page[data-page-number="${page}"]`);
  }

  private measure(): void {
    const { clientWidth: width, clientHeight: height } = this.host;
    const current = this.store.containerSize();
    if (current.width !== width || current.height !== height) {
      this.store.containerSize.set({ width, height });
    }
  }
}

/** Binary search over pages sorted top to bottom: index of the first page whose bottom is below `y`. */
function firstPageEndingAfter(pages: readonly HTMLElement[], y: number): number {
  let low = 0;
  let high = pages.length - 1;
  let result = pages.length;
  while (low <= high) {
    const middle = (low + high) >> 1;
    const element = pages[middle];
    if (element.offsetTop + element.offsetHeight > y) {
      result = middle;
      high = middle - 1;
    } else {
      low = middle + 1;
    }
  }
  return result;
}

/** Immutable set update that keeps the same instance when nothing changes. */
function withPage(pages: ReadonlySet<number>, page: number, present: boolean): ReadonlySet<number> {
  if (pages.has(page) === present) {
    return pages;
  }
  const next = new Set(pages);
  if (present) {
    next.add(page);
  } else {
    next.delete(page);
  }
  return next;
}
