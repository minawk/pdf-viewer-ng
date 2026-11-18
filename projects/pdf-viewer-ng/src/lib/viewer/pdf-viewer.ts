import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  isDevMode,
  output,
  untracked,
} from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDF_VIEWER_CONFIG } from '../core/config';
import { PdfLoadErrorKind } from '../core/errors';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { PdfSource, PdfViewerTheme, PdfViewerTool } from '../core/types';
import { ViewerStore } from '../core/viewer-store';
import { DocumentView } from '../document/document-view';
import { Toolbar } from '../toolbar/toolbar';

export interface PdfLoadedEvent {
  readonly pageCount: number;
  /** The pdf.js document, for advanced use (metadata, outline, attachments…). Do not destroy it. */
  readonly document: PDFDocumentProxy;
}

export interface PdfLoadErrorEvent {
  readonly kind: PdfLoadErrorKind;
  readonly error: unknown;
}

@Component({
  selector: 'pdfv-viewer',
  imports: [Toolbar, DocumentView],
  templateUrl: './pdf-viewer.html',
  styleUrl: './pdf-viewer.scss',
  providers: [ViewerStore],
  host: {
    role: 'group',
    '[attr.aria-label]': 'messages.viewerLabel',
    '[attr.data-pdfv-theme]': 'resolvedTheme()',
  },
})
export class PdfViewer {
  private readonly config = inject(PDF_VIEWER_CONFIG);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);
  protected readonly store = inject(ViewerStore);

  /** The PDF to display: a URL, binary data, or a `Blob`/`File`. */
  readonly src = input<PdfSource | null | undefined>(undefined);
  /** Theme name: a built-in theme or a custom one. Defaults to the `providePdfViewer()` theme. */
  readonly theme = input<PdfViewerTheme | undefined>(undefined);
  /** Toolbar items, in display order. Pass an empty array to hide the toolbar. */
  readonly tools = input<readonly PdfViewerTool[] | undefined>(undefined);

  /** Emitted each time a document has been opened. */
  readonly loaded = output<PdfLoadedEvent>();
  /** Emitted when a document cannot be opened. */
  readonly loadError = output<PdfLoadErrorEvent>();

  protected readonly resolvedTheme = computed(() => this.theme() ?? this.config.theme);
  protected readonly resolvedTools = computed(() => this.tools() ?? this.config.tools);

  constructor() {
    this.store.bindSource(this.src);
    this.notifyDocumentChanges();
    if (isDevMode()) {
      this.warnOnMissingTheme();
    }
  }

  /** Bridges document state to outputs and to the screen reader live region. */
  private notifyDocumentChanges(): void {
    effect(() => {
      if (this.store.status() === 'loading') {
        untracked(() => this.store.announce(this.messages.loading));
      }
    });
    effect(() => {
      const pdf = this.store.document();
      if (pdf) {
        untracked(() => {
          this.store.announce(this.messages.documentLoaded(pdf.numPages));
          this.loaded.emit({ pageCount: pdf.numPages, document: pdf });
        });
      }
    });
    effect(() => {
      const kind = this.store.loadErrorKind();
      if (kind) {
        // The message itself is announced by the role="alert" error panel.
        untracked(() => this.loadError.emit({ kind, error: this.store.loadError() }));
      }
    });
  }

  /** Helps developers who set a theme without loading its stylesheet. */
  private warnOnMissingTheme(): void {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    afterRenderEffect(() => {
      const theme = this.resolvedTheme();
      if (theme === 'light') {
        return;
      }
      const applied = getComputedStyle(host).getPropertyValue('--pdfv-theme').trim();
      if (applied !== theme) {
        console.warn(
          `[pdf-viewer-ng] Theme "${theme}" is not loaded. Add "@minawk/pdf-viewer-ng/styles/themes/${theme}.scss" ` +
            `to your styles, or declare it with the pdfv.theme() Sass mixin.`,
        );
      }
    });
  }
}
