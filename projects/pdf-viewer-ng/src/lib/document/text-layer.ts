import {
  afterRenderEffect,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  input,
  untracked,
  ViewEncapsulation,
} from '@angular/core';
import type { PDFPageProxy, TextLayer as PdfJsTextLayer } from 'pdfjs-dist';
import { PdfEngine } from '../core/pdf-engine';
import { ViewerStore } from '../core/viewer-store';
import { TextSelection } from './text-selection';

/** Delay before re-measuring text runs after a zoom: the layer itself follows the zoom instantly via CSS. */
const UPDATE_DELAY_MS = 150;

/**
 * Transparent, selectable text over a page canvas: text selection, copy, and the text read
 * by screen readers (the canvas is hidden from them).
 *
 * The pdf.js text runs are created outside Angular templates, so this component is not
 * encapsulated; its styles are scoped by the `pdfv-text-layer` element selector instead.
 * Every run is positioned in percentages and sized from `--total-scale-factor` (set by the
 * page), so zooming needs no re-render.
 */
@Component({
  selector: 'pdfv-text-layer',
  templateUrl: './text-layer.html',
  styleUrl: './text-layer.scss',
  encapsulation: ViewEncapsulation.None,
  host: {
    '(copy)': 'onCopy($event)',
  },
})
export class TextLayer {
  readonly page = input.required<PDFPageProxy>();
  readonly scale = input.required<number>();

  private readonly engine = inject(PdfEngine);
  private readonly store = inject(ViewerStore);
  private readonly selection = inject(TextSelection);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private textLayer: PdfJsTextLayer | null = null;
  private normalizeUnicode: ((text: string) => string) | null = null;

  constructor() {
    this.selection.register(this.host);
    inject(DestroyRef).onDestroy(() => {
      this.selection.unregister(this.host);
      this.textLayer?.cancel();
    });

    // Build the text runs of the page.
    afterRenderEffect((onCleanup) => {
      const page = this.page();
      let cancelled = false;
      let layer: PdfJsTextLayer | null = null;
      untracked(() => {
        void this.build(page, () => cancelled, (built) => (layer = built));
      });
      onCleanup(() => {
        cancelled = true;
        layer?.cancel();
        this.textLayer = null;
      });
    });

    // After a zoom, re-measure text widths at the new size (fonts do not scale linearly).
    afterRenderEffect((onCleanup) => {
      const scale = this.scale();
      const page = this.page();
      const timer = setTimeout(
        () => this.textLayer?.update({ viewport: page.getViewport({ scale }) }),
        UPDATE_DELAY_MS,
      );
      onCleanup(() => clearTimeout(timer));
    });
  }

  private async build(
    page: PDFPageProxy,
    isCancelled: () => boolean,
    onCreated: (layer: PdfJsTextLayer) => void,
  ): Promise<void> {
    try {
      const [pdfjs, content] = await Promise.all([
        this.engine.pdfjs(),
        this.store.getTextContent(page.pageNumber),
      ]);
      if (isCancelled()) {
        return;
      }
      this.normalizeUnicode = pdfjs.normalizeUnicode;
      this.host.replaceChildren();
      // The document language helps screen readers pronounce the text correctly.
      if (content.lang) {
        this.host.lang = content.lang;
      }
      const layer = new pdfjs.TextLayer({
        textContentSource: content,
        container: this.host,
        viewport: page.getViewport({ scale: untracked(this.scale) }),
      });
      onCreated(layer);
      await layer.render();
      if (isCancelled()) {
        return;
      }
      // Covers the page while selecting, see TextSelection.
      const endOfContent = this.host.ownerDocument.createElement('div');
      endOfContent.className = 'endOfContent';
      this.host.append(endOfContent);
      this.textLayer = layer;
    } catch (error) {
      // Cancelled when the page leaves the visible area: expected. Other failures only cost selection.
      if (!isCancelled() && (error as { name?: string })?.name !== 'AbortException') {
        console.warn('[pdf-viewer-ng] Text layer failed for page', page.pageNumber, error);
      }
    }
  }

  /** Copies the selected text with ligatures expanded (e.g. "ﬁ" -> "fi") and without NUL characters. */
  protected onCopy(event: ClipboardEvent): void {
    const text = this.host.ownerDocument.getSelection()?.toString();
    if (!text || !event.clipboardData || !this.normalizeUnicode) {
      return;
    }
    event.clipboardData.setData('text/plain', this.normalizeUnicode(text).replaceAll('\0', ''));
    event.preventDefault();
  }
}
