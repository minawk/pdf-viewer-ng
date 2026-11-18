import { computed, Injectable, signal } from '@angular/core';
import { PdfInteractionTool, PdfZoom } from './types';

/**
 * State of a single `<pdfv-viewer>` instance. Provided by the viewer component itself,
 * so several viewers on one page never share state.
 */
@Injectable()
export class ViewerStore {
  readonly pageCount = signal(0);
  readonly currentPage = signal(1);
  readonly zoom = signal<PdfZoom>('fit-width');
  readonly tool = signal<PdfInteractionTool>('select');
  readonly searchOpen = signal(false);

  /** Latest message for the polite live region. */
  readonly announcement = signal('');

  readonly hasDocument = computed(() => this.pageCount() > 0);
  readonly canGoPrevious = computed(() => this.hasDocument() && this.currentPage() > 1);
  readonly canGoNext = computed(() => this.hasDocument() && this.currentPage() < this.pageCount());

  setTool(tool: PdfInteractionTool): void {
    this.tool.set(tool);
  }

  announce(message: string): void {
    this.announcement.set(message);
  }
}
