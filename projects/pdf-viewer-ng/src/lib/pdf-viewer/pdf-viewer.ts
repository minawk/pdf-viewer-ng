import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  isDevMode,
  model,
  output,
  signal,
  untracked,
} from '@angular/core';
import { outputFromObservable } from '@angular/core/rxjs-interop';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDF_VIEWER_CONFIG } from '../core/config';
import { PdfLoadErrorKind } from '../core/errors/errors';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { PdfPageMode, PdfSource, PdfViewerTheme, PdfViewerTool, PdfZoom } from '../core/types';
import { ViewerStore } from '../core/viewer-store/viewer-store';
import { AnnotationStore } from '../annotations/annotation-store/annotation-store';
import { PdfAnnotation } from '../annotations/model';
import { DocumentView } from '../document/document-view/document-view';
import { FileActions } from '../features/file-actions';
import { PrintService } from '../features/print';
import { PrintDialog } from '../features/print-dialog/print-dialog';
import { SearchBar } from '../search/search-bar/search-bar';
import { SearchStore } from '../search/search-store';
import { Toolbar } from '../toolbar/toolbar/toolbar';

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
  imports: [Toolbar, DocumentView, SearchBar, PrintDialog],
  templateUrl: './pdf-viewer.html',
  styleUrl: './pdf-viewer.scss',
  providers: [ViewerStore, SearchStore, FileActions, PrintService, AnnotationStore],
  host: {
    role: 'group',
    '[attr.aria-label]': 'messages.viewerLabel',
    '[attr.data-pdfv-theme]': 'resolvedTheme()',
    '(keydown)': 'onKeydown($event)',
    '(dragenter)': 'onDragEnter($event)',
    '(dragover)': 'onDragOver($event)',
    '(dragleave)': 'onDragLeave()',
    '(drop)': 'onDrop($event)',
  },
})
export class PdfViewer {
  private readonly config = inject(PDF_VIEWER_CONFIG);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);
  protected readonly store = inject(ViewerStore);
  protected readonly search = inject(SearchStore);
  protected readonly files = inject(FileActions);
  protected readonly printer = inject(PrintService);
  private readonly annotationStore = inject(AnnotationStore);

  /** The PDF to display: a URL, binary data, or a `Blob`/`File`. */
  readonly src = input<PdfSource | null | undefined>(undefined);
  /** Name of the downloaded file. Defaults to the opened file's name or the last segment of the URL. */
  readonly fileName = input<string | undefined>(undefined);
  /** Theme name: a built-in theme or a custom one. Defaults to the `providePdfViewer()` theme. */
  readonly theme = input<PdfViewerTheme | undefined>(undefined);
  /** Toolbar items, in display order. Pass an empty array to hide the toolbar. */
  readonly tools = input<readonly PdfViewerTool[] | undefined>(undefined);
  /** `continuous` (all pages, scrolling) or `single` (one page per view). Defaults to the `providePdfViewer()` value. */
  readonly pageMode = input<PdfPageMode | undefined>(undefined);
  /** Current page, 1-based. Supports two-way binding: `[(page)]`. */
  readonly page = model(1);
  /**
   * Zoom: `'fit-width'`, `'fit-page'` or a factor of the actual size (1 = 100%).
   * Defaults to the `providePdfViewer()` value. Supports two-way binding: `[(zoom)]`.
   */
  readonly zoom = model<PdfZoom | undefined>(undefined);

  /**
   * Highlights and text notes of the document. Supports two-way binding: `[(annotations)]`.
   * They are saved into the downloaded file as standard PDF annotations, and printed.
   */
  readonly annotations = model<readonly PdfAnnotation[] | undefined>(undefined);

  /** Emitted each time a document has been opened. */
  readonly loaded = output<PdfLoadedEvent>();
  /** Emitted when a document cannot be opened. */
  readonly loadError = output<PdfLoadErrorEvent>();
  /** Emitted with each local file opened from the toolbar or by drag and drop. */
  readonly fileOpened = outputFromObservable(this.files.opened$);
  /** Emitted after the document was downloaded. */
  readonly downloaded = outputFromObservable(this.files.downloaded$);

  /** A file is being dragged over the viewer. */
  protected readonly dragging = signal(false);
  private dragDepth = 0;

  protected readonly resolvedTheme = computed(() => this.theme() ?? this.config.theme);
  protected readonly resolvedTools = computed(() => this.tools() ?? this.config.tools);
  /** Dropping files is available along with the "open" tool. */
  private readonly canOpenFiles = computed(() => this.resolvedTools().includes('open'));

  constructor() {
    this.store.connect({ src: this.src, pageMode: this.pageMode, zoom: this.zoom, fileName: this.fileName });
    this.annotationStore.connect(this.annotations);
    this.syncPage();
    this.syncZoom();
    this.syncAnnotations();
    this.notifyDocumentChanges();
    if (isDevMode()) {
      this.warnOnMissingTheme();
    }
  }

  /** Two-way synchronization between the `page` model and the store. */
  private syncPage(): void {
    // Parent -> viewer: navigate when the bound page changes.
    effect(() => {
      const page = this.page();
      untracked(() => {
        if (!this.store.document() || page !== this.store.currentPage()) {
          this.store.goToPage(page);
        }
      });
    });
    // Viewer -> parent: report navigation and scrolling, once a document is shown.
    effect(() => {
      if (!this.store.document()) {
        return;
      }
      const page = this.store.currentPage();
      untracked(() => {
        if (page !== this.page()) {
          this.page.set(page);
        }
      });
    });
  }

  /** Shows the file picker and opens the chosen PDF in the viewer. */
  openFile(): void {
    this.files.pick();
  }

  /** Downloads the document, with its edits. */
  download(): Promise<void> {
    return this.files.download();
  }

  /** Prints the whole document. */
  print(): Promise<void> {
    return this.printer.print();
  }

  // ---- Drag and drop ---------------------------------------------------------------------

  protected onDragEnter(event: DragEvent): void {
    if (this.acceptsDrag(event)) {
      this.dragDepth++;
      this.dragging.set(true);
    }
  }

  protected onDragOver(event: DragEvent): void {
    if (this.acceptsDrag(event)) {
      event.preventDefault(); // allows the drop
      event.dataTransfer!.dropEffect = 'copy';
    }
  }

  protected onDragLeave(): void {
    // Enter/leave fire for every child element crossed: only the outermost leave counts.
    if (this.dragDepth > 0 && --this.dragDepth === 0) {
      this.dragging.set(false);
    }
  }

  protected onDrop(event: DragEvent): void {
    if (!this.acceptsDrag(event)) {
      return;
    }
    event.preventDefault();
    this.dragDepth = 0;
    this.dragging.set(false);
    const file = event.dataTransfer?.files[0];
    if (file) {
      this.files.open(file);
    }
  }

  private acceptsDrag(event: DragEvent): boolean {
    return this.canOpenFiles() && !!event.dataTransfer?.types.includes('Files');
  }

  /** Viewer -> parent: the store's zoom follows the `zoom` model by itself (linked signal). */
  private syncZoom(): void {
    effect(() => {
      const zoom = this.store.zoom();
      untracked(() => {
        if (zoom !== this.zoom()) {
          this.zoom.set(zoom);
        }
      });
    });
  }

  /** Viewer -> parent: annotations added, changed or removed in the viewer. */
  private syncAnnotations(): void {
    effect(() => {
      const annotations = this.annotationStore.annotations();
      untracked(() => {
        if (annotations !== this.annotations() && (this.annotations() !== undefined || annotations.length > 0)) {
          this.annotations.set(annotations);
        }
      });
    });
  }

  /**
   * Shortcuts, wherever the focus is inside the viewer:
   * Ctrl/Cmd + F (search), F3 / Ctrl/Cmd + G (next result, with Shift: previous),
   * Ctrl/Cmd + `+`, `-`, `0` (zoom).
   */
  protected onKeydown(event: KeyboardEvent): void {
    if (event.altKey || !this.store.hasDocument()) {
      return;
    }
    const modifier = event.ctrlKey || event.metaKey;
    if (event.key === 'F3' || (modifier && event.key.toLowerCase() === 'g')) {
      if (this.search.isOpen()) {
        event.preventDefault();
        if (event.shiftKey) {
          this.search.previous();
        } else {
          this.search.next();
        }
      }
      return;
    }
    if (!modifier) {
      return;
    }
    switch (event.key) {
      case 'f':
      case 'F':
        this.search.open(); // instead of the browser find bar, which cannot see unrendered pages
        break;
      case '+':
      case '=':
        this.store.zoomIn();
        break;
      case '-':
      case '_':
        this.store.zoomOut();
        break;
      case '0':
        this.store.setZoom(this.config.zoom);
        break;
      default:
        return;
    }
    event.preventDefault(); // instead of the browser page zoom
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
