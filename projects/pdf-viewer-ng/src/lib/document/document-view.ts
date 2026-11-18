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
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { ScrollPosition, ViewerStore } from '../core/viewer-store';
import { PAGE_GAP } from '../utils/zoom';
import { Page } from './page';

/** Scroll position expressed relative to a page, so it survives zoom and layout changes. */
interface ScrollAnchor {
  readonly page: number;
  /** Offset of the viewport top from the page top, as a fraction of the page height. */
  readonly ratio: number;
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
  templateUrl: './document-view.html',
  styleUrl: './document-view.scss',
  host: {
    role: 'region',
    tabindex: '0',
    '[attr.aria-label]': 'messages.documentLabel',
    '[attr.aria-busy]': "store.status() === 'loading'",
    '[attr.data-page-mode]': 'store.pageMode()',
    '[style.--pdfv-page-gap.px]': 'pageGap',
    '(keydown)': 'onKeydown($event)',
  },
})
export class DocumentView {
  protected readonly store = inject(ViewerStore);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);
  protected readonly pageGap = PAGE_GAP;

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
        this.intersectionObserver = new IntersectionObserver((entries) => this.onIntersect(entries), {
          root: this.host,
          rootMargin: '100% 0px',
        });
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
    });

    // Keep the reading position when the layout changes: zoom, resize, page sizes, page mode.
    afterRenderEffect(() => {
      this.store.scale();
      this.store.pageSizes();
      this.store.pageMode();
      untracked(() => this.restoreAnchor());
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

  protected onKeydown(event: KeyboardEvent): void {
    // Only when the document area itself has focus: never steal keys from inner controls.
    if (event.target !== this.host || event.altKey || event.ctrlKey || event.metaKey || !this.store.hasDocument()) {
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
      this.expectedScrollTop !== null && Math.abs(this.host.scrollTop - this.expectedScrollTop) <= 1;
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
    const top =
      position === 'end'
        ? element.offsetTop + element.offsetHeight + PAGE_GAP - this.host.clientHeight
        : element.offsetTop - PAGE_GAP;
    this.setScrollTop(top);
    this.anchor = { page, ratio: (this.host.scrollTop - element.offsetTop) / (element.offsetHeight || 1) };
  }

  private restoreAnchor(): void {
    const anchor = this.anchor;
    const element = anchor && this.pageElement(anchor.page);
    if (anchor && element) {
      this.setScrollTop(element.offsetTop + anchor.ratio * element.offsetHeight);
    }
  }

  private readAnchor(): ScrollAnchor | null {
    const scrollTop = this.host.scrollTop;
    const pages = this.pageElements();
    const index = firstPageEndingAfter(pages, scrollTop);
    const element = pages[index];
    if (!element) {
      return null;
    }
    return {
      page: Number(element.dataset['pageNumber']),
      ratio: (scrollTop - element.offsetTop) / (element.offsetHeight || 1),
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

  private setScrollTop(top: number): void {
    const max = this.host.scrollHeight - this.host.clientHeight;
    const target = Math.round(Math.min(Math.max(0, top), Math.max(0, max)));
    if (Math.abs(this.host.scrollTop - target) >= 1) {
      this.expectedScrollTop = target;
      // Instant, even under `scroll-behavior: smooth`; also aborts an ongoing smooth scroll
      // (e.g. a keyboard PageDown still animating when the page is turned).
      this.host.scrollTo({ top: target, behavior: 'instant' });
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
