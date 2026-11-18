import { afterRenderEffect, Component, computed, ElementRef, inject, viewChild } from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { Icon } from '../icon/icon';
import { SearchStore } from './search-store';

/** Marks the control that opens the search panel, so focus can return to it on close. */
export const SEARCH_TOGGLE_ATTRIBUTE = 'data-pdfv-search-toggle';

/**
 * Search panel: field, match case / whole words options, previous / next result, close.
 * Enter: next result; Shift+Enter: previous; Escape: close and return focus.
 */
@Component({
  selector: 'pdfv-search-bar',
  imports: [Icon],
  templateUrl: './search-bar.html',
  styleUrl: './search-bar.scss',
  host: {
    role: 'search',
    '[id]': 'search.panelId',
    '[attr.aria-label]': 'messages.searchLabel',
    '(keydown.escape)': 'close($event)',
  },
})
export class SearchBar {
  protected readonly search = inject(SearchStore);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);
  protected readonly countId = `${this.search.panelId}-count`;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly input = viewChild.required<ElementRef<HTMLInputElement>>('input');

  /** Visible counter, also the description of the field. */
  protected readonly countText = computed(() => {
    if (!this.search.query().trim()) {
      return '';
    }
    const total = this.search.total();
    if (this.search.status() === 'done' && total === 0) {
      return this.messages.noResults;
    }
    if (total === 0) {
      return this.messages.searching;
    }
    return this.messages.searchCount(this.search.position(), total);
  });

  constructor() {
    // Focus (and select) the field when opened, and again on Ctrl+F while open.
    afterRenderEffect(() => {
      this.search.focusRequest();
      const input = this.input().nativeElement;
      input.focus();
      input.select();
    });
  }

  protected onEnter(event: Event, backwards: boolean): void {
    event.preventDefault();
    if (backwards) {
      this.search.previous();
    } else {
      this.search.next();
    }
  }

  /** Closes the panel and gives focus back to the control that opened it. */
  protected close(event?: Event): void {
    event?.preventDefault(); // Escape would otherwise also clear the search field
    const viewer = this.host.closest('pdfv-viewer');
    const target =
      viewer?.querySelector<HTMLElement>(`[${SEARCH_TOGGLE_ATTRIBUTE}]`) ??
      viewer?.querySelector<HTMLElement>('pdfv-document-view');
    target?.focus();
    this.search.close();
  }
}
