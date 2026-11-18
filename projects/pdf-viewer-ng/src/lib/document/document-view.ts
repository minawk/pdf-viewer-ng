import {
  afterNextRender,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  signal,
} from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { ViewerStore } from '../core/viewer-store';
import { PAGE_GAP } from '../utils/zoom';
import { Page } from './page';

/**
 * Scrollable document area. Tracks which pages are near the visible area with a single
 * IntersectionObserver, so only those pages get a canvas (virtualized rendering).
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
    '[style.--pdfv-page-gap.px]': 'pageGap',
  },
})
export class DocumentView {
  protected readonly store = inject(ViewerStore);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);
  protected readonly pageGap = PAGE_GAP;

  /** Pages intersecting the visible area extended by one screen above and below. */
  readonly nearPages = signal<ReadonlySet<number>>(new Set());

  protected readonly pageNumbers = computed(() =>
    Array.from({ length: this.store.pageCount() }, (_, index) => index + 1),
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
    });
  }

  /** Called by each page to take part in virtualization. */
  observe(element: Element, pageNumber: number): void {
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

  private measure(): void {
    const { clientWidth: width, clientHeight: height } = this.host;
    const current = this.store.containerSize();
    if (current.width !== width || current.height !== height) {
      this.store.containerSize.set({ width, height });
    }
  }
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
