import { Component, inject, input } from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../../core/messages';
import { ViewerStore } from '../../core/viewer-store/viewer-store';
import { Icon } from '../../icon/icon';
import { ToolbarItem } from '../roving-toolbar/roving-toolbar';

let nextId = 0;

/** First / previous / page number / next / last controls. */
@Component({
  selector: 'pdfv-pager',
  imports: [Icon, ToolbarItem],
  templateUrl: './pager.html',
  styleUrl: './pager.scss',
  host: {
    role: 'group',
    '[attr.aria-label]': 'messages.pagerGroup',
  },
})
export class Pager {
  /** Narrow toolbar: first and last page move to the "More tools" menu. */
  readonly compact = input(false);

  protected readonly store = inject(ViewerStore);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);
  protected readonly totalId = `pdfv-page-total-${nextId++}`;

  /** Navigates to the typed page, or restores the current page number if the input is not a page. */
  protected commit(input: HTMLInputElement): void {
    const page = Number(input.value.trim());
    if (Number.isInteger(page) && page >= 1 && page <= this.store.pageCount()) {
      this.store.goToPage(page);
    }
    input.value = String(this.store.currentPage());
  }

  protected revert(input: HTMLInputElement): void {
    input.value = String(this.store.currentPage());
    input.select();
  }
}
