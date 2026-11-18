import { computed, effect, inject, Injectable, signal, untracked } from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { ViewerStore } from '../core/viewer-store/viewer-store';
import { buildPageText, findMatches, searchPattern, TextMatch } from './text-search/text-search';

/** Delay between the last keystroke and the search. */
const SEARCH_DEBOUNCE_MS = 200;

export type SearchStatus = 'idle' | 'searching' | 'done';

/** A search result: page number and index of the match within that page. */
export interface SearchResult {
  readonly page: number;
  readonly index: number;
}

let nextId = 0;

/**
 * Search in the document text, per viewer. Pages are scanned in the background, starting
 * from the current page, and their matches are published as soon as each page is done:
 * the first result is shown without waiting for the whole document.
 */
@Injectable()
export class SearchStore {
  private readonly store = inject(ViewerStore);
  private readonly messages = inject(PDF_VIEWER_MESSAGES);

  /** Id of the search panel, for `aria-controls`. */
  readonly panelId = `pdfv-search-${nextId++}`;

  readonly isOpen = signal(false);
  readonly query = signal('');
  readonly matchCase = signal(false);
  readonly wholeWord = signal(false);
  readonly status = signal<SearchStatus>('idle');

  /** Matches found so far, by page. */
  readonly pageMatches = signal<ReadonlyMap<number, readonly TextMatch[]>>(new Map());
  readonly current = signal<SearchResult | null>(null);
  /** Result to scroll into view as soon as its page displays it. */
  readonly pendingReveal = signal<SearchResult | null>(null);
  /** Incremented to ask the search field to take focus. */
  readonly focusRequest = signal(0);

  /** Every result, in document order. */
  readonly results = computed<readonly SearchResult[]>(() => {
    const byPage = this.pageMatches();
    return [...byPage.keys()]
      .sort((a, b) => a - b)
      .flatMap((page) => byPage.get(page)!.map((_, index) => ({ page, index })));
  });
  readonly total = computed(() => this.results().length);

  /** 1-based position of the current result, 0 when there is none. */
  readonly position = computed(() => {
    const current = this.current();
    if (!current) {
      return 0;
    }
    return (
      this.results().findIndex((r) => r.page === current.page && r.index === current.index) + 1
    );
  });

  constructor() {
    effect((onCleanup) => {
      const pdf = this.store.document();
      const query = this.isOpen() ? this.query() : '';
      const options = { matchCase: this.matchCase(), wholeWord: this.wholeWord() };
      untracked(() => this.reset());
      const pattern = pdf ? searchPattern(query, options) : null;
      if (!pdf || !pattern) {
        return;
      }
      const controller = new AbortController();
      const timer = setTimeout(
        () => void this.run(pdf.numPages, pattern, controller.signal),
        SEARCH_DEBOUNCE_MS,
      );
      onCleanup(() => {
        clearTimeout(timer);
        controller.abort();
      });
    });
  }

  /** Opens the search panel, or focuses its field when it is already open. */
  open(): void {
    this.isOpen.set(true);
    this.focusRequest.update((n) => n + 1);
  }

  close(): void {
    this.isOpen.set(false);
  }

  next(): void {
    this.move(1);
  }

  previous(): void {
    this.move(-1);
  }

  private move(delta: 1 | -1): void {
    const results = this.results();
    if (results.length === 0) {
      return;
    }
    const position = this.position();
    const index =
      position === 0
        ? delta > 0
          ? 0
          : results.length - 1
        : (position - 1 + delta + results.length) % results.length;
    this.select(results[index]);
    this.store.announce(this.messages.searchResult(index + 1, results.length));
  }

  private select(result: SearchResult): void {
    this.current.set(result);
    this.pendingReveal.set(result);
    this.store.goToPage(result.page, { position: 'nearest', announce: false });
  }

  private reset(): void {
    this.pageMatches.set(new Map());
    this.current.set(null);
    this.pendingReveal.set(null);
    this.status.set('idle');
  }

  private async run(pageCount: number, pattern: RegExp, signal: AbortSignal): Promise<void> {
    this.status.set('searching');
    // From the current page to the end, then from the start: the first result shown is the
    // next one in reading order.
    const start = this.store.currentPage();
    const order = Array.from({ length: pageCount }, (_, i) => ((start - 1 + i) % pageCount) + 1);
    for (const page of order) {
      let matches: TextMatch[];
      try {
        matches = findMatches(buildPageText(await this.store.getTextContent(page)), pattern);
      } catch {
        matches = []; // a page whose text cannot be read has no results
      }
      if (signal.aborted) {
        return;
      }
      if (matches.length > 0) {
        this.pageMatches.update((byPage) => new Map(byPage).set(page, matches));
        if (!this.current()) {
          this.select({ page, index: 0 });
        }
      }
    }
    this.status.set('done');
    const total = this.total();
    this.store.announce(
      total === 0
        ? this.messages.noResults
        : `${this.messages.searchResults(total)}. ${this.messages.searchResult(this.position(), total)}`,
    );
  }
}
