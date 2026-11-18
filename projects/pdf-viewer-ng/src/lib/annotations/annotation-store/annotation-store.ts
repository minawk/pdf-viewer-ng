import { computed, DOCUMENT, effect, inject, Injectable, linkedSignal, signal, untracked } from '@angular/core';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PDF_VIEWER_MESSAGES } from '../../core/messages';
import { ViewerStore } from '../../core/viewer-store/viewer-store';
import { Box, mergeLineBoxes, serializeAnnotation } from '../geometry/geometry';
import {
  createAnnotationId,
  DEFAULT_FONT_SIZE,
  HIGHLIGHT_COLORS,
  PdfAnnotation,
  PdfRect,
  TEXT_COLORS,
} from '../model';

/** What the store needs from the annotation layer of a page. */
export interface AnnotationLayerHandle {
  /** Client (viewport) boxes to PDF rectangles of this page. */
  toPdfRects(boxes: readonly Box[]): PdfRect[];
  /** Adds a text note in the visible part of the page and starts editing it. */
  addTextNoteInView(): void;
}

/**
 * Prefix of the keys used in the pdf.js annotation storage. The pdf.js worker only treats
 * entries whose key starts with `pdfjs_internal_editor_` as new annotations to write.
 */
const STORAGE_PREFIX = 'pdfjs_internal_editor_pdfv-';

/**
 * Annotations of the document, per viewer. They are mirrored into the pdf.js annotation
 * storage in the format of the pdf.js editors, so the downloaded file contains them as real
 * PDF annotations, and printing draws them.
 */
@Injectable()
export class AnnotationStore {
  private readonly store = inject(ViewerStore);
  private readonly messages = inject(PDF_VIEWER_MESSAGES);
  private readonly document = inject(DOCUMENT);

  private readonly input = signal<() => readonly PdfAnnotation[] | undefined>(() => undefined);

  /**
   * Follows the `annotations` input. When the document is replaced (opened from the toolbar,
   * or a new `src` alone), the annotations of the previous one are dropped, until the input
   * itself changes.
   */
  readonly annotations = linkedSignal<
    { input: readonly PdfAnnotation[] | undefined; pdf: PDFDocumentProxy | null },
    readonly PdfAnnotation[]
  >({
    source: () => ({ input: this.input()(), pdf: this.store.document() }),
    computation: (source, previous) => {
      if (!previous || source.input !== previous.source.input) {
        return source.input ?? [];
      }
      if (previous.source.pdf && previous.source.pdf !== source.pdf) {
        return [];
      }
      return previous.value;
    },
  });

  readonly byPage = computed(() => {
    const byPage = new Map<number, PdfAnnotation[]>();
    for (const annotation of this.annotations()) {
      byPage.set(annotation.page, [...(byPage.get(annotation.page) ?? []), annotation]);
    }
    return byPage;
  });

  readonly selectedId = signal<string | null>(null);
  readonly editingId = signal<string | null>(null);
  /** Colors and size of the next annotations: the last ones chosen. */
  readonly highlightColor = signal(HIGHLIGHT_COLORS[0].value);
  readonly textColor = signal(TEXT_COLORS[0].value);
  readonly fontSize = signal(DEFAULT_FONT_SIZE);

  private readonly layers = new Map<number, AnnotationLayerHandle>();
  private storedKeys: string[] = [];
  private storedDocument: PDFDocumentProxy | null = null;

  constructor() {
    // Mirror the annotations into the pdf.js storage, used by saveDocument() and printing.
    effect(() => {
      const pdf = this.store.document();
      const annotations = this.annotations();
      untracked(() => this.syncStorage(pdf, annotations));
    });
  }

  /** Connects the viewer's `annotations` input. */
  connect(input: () => readonly PdfAnnotation[] | undefined): void {
    this.input.set(input);
  }

  registerLayer(page: number, layer: AnnotationLayerHandle): void {
    this.layers.set(page, layer);
  }

  unregisterLayer(page: number, layer: AnnotationLayerHandle): void {
    if (this.layers.get(page) === layer) {
      this.layers.delete(page);
    }
  }

  add(annotation: PdfAnnotation): void {
    this.annotations.update((list) => [...list, annotation]);
  }

  update(id: string, changes: Partial<PdfAnnotation>): void {
    this.annotations.update((list) =>
      list.map((annotation) => (annotation.id === id ? ({ ...annotation, ...changes } as PdfAnnotation) : annotation)),
    );
  }

  remove(id: string, announce = true): void {
    this.annotations.update((list) => list.filter((annotation) => annotation.id !== id));
    if (this.selectedId() === id) {
      this.selectedId.set(null);
    }
    if (this.editingId() === id) {
      this.editingId.set(null);
    }
    if (announce) {
      this.store.announce(this.messages.annotationDeleted);
    }
  }

  /** Highlights the current text selection of the document: one annotation per page. */
  highlightSelection(): boolean {
    const selection = this.document.getSelection();
    if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
      return false;
    }
    const pages = new Map<number, { boxes: Box[]; text: string[] }>();
    for (let index = 0; index < selection.rangeCount; index++) {
      collectTextRuns(this.document, selection.getRangeAt(index), pages);
    }
    let created = 0;
    for (const [page, { boxes, text }] of pages) {
      const rects = this.layers.get(page)?.toPdfRects(mergeLineBoxes(boxes)) ?? [];
      if (rects.length === 0) {
        continue;
      }
      this.add({
        id: createAnnotationId(),
        type: 'highlight',
        page,
        color: this.highlightColor(),
        rects,
        text: text.join(' ').replace(/\s+/g, ' ').trim(),
      });
      created++;
    }
    if (created > 0) {
      selection.removeAllRanges();
      this.store.announce(this.messages.highlightAdded);
    }
    return created > 0;
  }

  /** Adds a text note in the visible part of the current page (keyboard creation). */
  addTextNoteInView(): void {
    this.layers.get(this.store.currentPage())?.addTextNoteInView();
  }

  private syncStorage(pdf: PDFDocumentProxy | null, annotations: readonly PdfAnnotation[]): void {
    if (pdf !== this.storedDocument) {
      this.storedKeys = [];
      this.storedDocument = pdf;
    }
    if (!pdf) {
      return;
    }
    const storage = pdf.annotationStorage;
    for (const key of this.storedKeys) {
      storage.remove(key);
    }
    this.storedKeys = [];
    for (const annotation of annotations) {
      // Notes being written without text yet are not saved.
      if (annotation.type === 'text' && !annotation.text.trim()) {
        continue;
      }
      const key = STORAGE_PREFIX + annotation.id;
      storage.setValue(key, serializeAnnotation(annotation));
      this.storedKeys.push(key);
    }
  }
}

/**
 * Client rectangles and text of every text layer run inside a range, grouped by page.
 * Measured per text node, so the boxes only cover glyphs, never whole containers.
 */
function collectTextRuns(
  document: Document,
  range: Range,
  pages: Map<number, { boxes: Box[]; text: string[] }>,
): void {
  const root = range.commonAncestorContainer;
  const nodes: Text[] = [];
  if (root.nodeType === Node.TEXT_NODE) {
    nodes.push(root as Text);
  } else {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if (range.intersectsNode(node)) {
        nodes.push(node as Text);
      }
    }
  }
  for (const node of nodes) {
    const pageElement = node.parentElement?.closest('pdfv-text-layer')?.closest<HTMLElement>('pdfv-page');
    const page = Number(pageElement?.dataset['pageNumber']);
    if (!page) {
      continue;
    }
    const start = node === range.startContainer ? range.startOffset : 0;
    const end = node === range.endContainer ? range.endOffset : node.length;
    if (end <= start) {
      continue;
    }
    const part = document.createRange();
    part.setStart(node, start);
    part.setEnd(node, end);
    const entry = pages.get(page) ?? { boxes: [], text: [] };
    for (const rect of Array.from(part.getClientRects())) {
      entry.boxes.push({ left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom });
    }
    entry.text.push(node.data.slice(start, end));
    pages.set(page, entry);
  }
}
