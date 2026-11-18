import {
  afterNextRender,
  afterRenderEffect,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  untracked,
} from '@angular/core';
import type { PDFPageProxy } from 'pdfjs-dist';
import { PDF_VIEWER_MESSAGES } from '../../core/messages';
import { ViewerStore } from '../../core/viewer-store/viewer-store';
import { Icon } from '../../icon/icon';
import { RovingToolbar, ToolbarItem } from '../../toolbar/roving-toolbar/roving-toolbar';
import { AnnotationLayerHandle, AnnotationStore } from '../annotation-store/annotation-store';
import { Box, boundingRect, boxToPdfRect, containsPoint, pdfRectToPercentBox } from '../geometry/geometry';
import {
  AnnotationColor,
  createAnnotationId,
  HIGHLIGHT_COLORS,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  PdfAnnotation,
  PdfTextAnnotation,
  TEXT_COLORS,
} from '../model';

/** An annotation with its position on the page, in percentages of the page size. */
interface AnnotationView {
  readonly annotation: PdfAnnotation;
  readonly box: Box;
  /** Highlight lines, relative to `box`, in percentages of the box size. */
  readonly lines: readonly Box[];
}

/** Distance the pointer must travel before a press on a note becomes a drag. */
const DRAG_THRESHOLD_PX = 3;
/** Line height of free text, as in the appearance pdf.js writes into the file. */
const LINE_FACTOR = 1.35;

let nextId = 0;

/**
 * Annotations of one page: highlights and text notes, their keyboard and pointer
 * interactions, and the options toolbar of the selected annotation.
 */
@Component({
  selector: 'pdfv-annotation-layer',
  imports: [Icon, RovingToolbar, ToolbarItem],
  templateUrl: './annotation-layer.html',
  styleUrl: './annotation-layer.scss',
  host: {
    '[class.creating]': "viewer.tool() === 'text'",
    '(pointerdown)': 'onSurfacePointerDown($event)',
    '(mousedown)': 'onSurfaceMouseDown($event)',
  },
})
export class AnnotationLayer implements AnnotationLayerHandle {
  readonly page = input.required<PDFPageProxy>();
  readonly scale = input.required<number>();

  protected readonly viewer = inject(ViewerStore);
  protected readonly annotations = inject(AnnotationStore);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly highlightHintId = `pdfv-highlight-hint-${nextId}`;
  protected readonly textHintId = `pdfv-text-hint-${nextId++}`;

  private readonly viewport = computed(() => this.page().getViewport({ scale: 1 }));
  private readonly pageNumber = computed(() => this.page().pageNumber);

  protected readonly items = computed<readonly AnnotationView[]>(() => {
    const viewport = this.viewport();
    return (this.annotations.byPage().get(this.pageNumber()) ?? []).map((annotation) => {
      if (annotation.type === 'text') {
        return { annotation, box: pdfRectToPercentBox(viewport, annotation.rect), lines: [] };
      }
      const box = pdfRectToPercentBox(viewport, boundingRect(annotation.rects));
      const width = box.right - box.left || 1;
      const height = box.bottom - box.top || 1;
      const lines = annotation.rects.map((rect) => {
        const line = pdfRectToPercentBox(viewport, rect);
        return {
          left: ((line.left - box.left) / width) * 100,
          top: ((line.top - box.top) / height) * 100,
          right: ((line.right - box.left) / width) * 100,
          bottom: ((line.bottom - box.top) / height) * 100,
        };
      });
      return { annotation, box, lines };
    });
  });

  /** Id of the annotation to focus after the next render (end of editing). */
  private focusRequest: string | null = null;
  private editingFocused: string | null = null;

  constructor() {
    afterNextRender(() => this.annotations.registerLayer(this.pageNumber(), this));
    const destroyRef = inject(DestroyRef);
    destroyRef.onDestroy(() => this.annotations.unregisterLayer(this.pageNumber(), this));

    // Page-wide pointer handling: the layer itself lets pointer events through to the text.
    afterNextRender(() => {
      const pageElement = this.host.closest<HTMLElement>('pdfv-page');
      if (!pageElement) {
        return;
      }
      const controller = new AbortController();
      pageElement.addEventListener('pointerdown', (event) => this.onPagePointerDown(event), {
        signal: controller.signal,
      });
      pageElement.addEventListener('click', (event) => this.onPageClick(event), { signal: controller.signal });
      destroyRef.onDestroy(() => controller.abort());
    });

    // Focus the note being edited (once per edit), or the annotation requested.
    afterRenderEffect(() => {
      const editing = this.annotations.editingId();
      this.items();
      untracked(() => {
        if (editing && editing !== this.editingFocused) {
          const element = this.element(editing);
          if (element) {
            this.editingFocused = editing;
            element.focus();
            placeCaretAtEnd(element);
          }
        }
        if (!editing) {
          this.editingFocused = null;
        }
        if (this.focusRequest) {
          const element = this.element(this.focusRequest);
          this.focusRequest = null;
          element?.focus();
        }
      });
    });
  }

  // ---- AnnotationLayerHandle ------------------------------------------------------------

  toPdfRects(boxes: readonly Box[]) {
    const origin = this.host.getBoundingClientRect();
    const scale = this.scale();
    return boxes.map((box) =>
      boxToPdfRect(this.viewport(), {
        left: (box.left - origin.left) / scale,
        top: (box.top - origin.top) / scale,
        right: (box.right - origin.left) / scale,
        bottom: (box.bottom - origin.top) / scale,
      }),
    );
  }

  addTextNoteInView(): void {
    // Near the top-left corner of the visible part of the page.
    const page = this.host.getBoundingClientRect();
    const view = this.host.closest('pdfv-document-view')?.getBoundingClientRect() ?? page;
    const left = Math.max(page.left, view.left) - page.left + 24;
    const top = Math.max(page.top, view.top) - page.top + 24;
    this.createTextNote(left / this.scale(), top / this.scale());
  }

  // ---- Template helpers -----------------------------------------------------------------

  protected colorsFor(annotation: PdfAnnotation): readonly AnnotationColor[] {
    return annotation.type === 'highlight' ? HIGHLIGHT_COLORS : TEXT_COLORS;
  }

  protected fontSize(annotation: PdfTextAnnotation): string {
    return `calc(${annotation.fontSize}px * var(--total-scale-factor))`;
  }

  /** The options toolbar goes below the annotation, or above it near the bottom of the page. */
  protected toolbarAbove(item: AnnotationView): boolean {
    return item.box.bottom > 85;
  }

  // ---- Selection & keyboard ----------------------------------------------------------------

  protected select(id: string): void {
    if (this.annotations.selectedId() !== id) {
      this.annotations.selectedId.set(id);
    }
  }

  protected edit(id: string): void {
    this.annotations.selectedId.set(id);
    this.annotations.editingId.set(id);
  }

  protected onKeydown(item: AnnotationView, event: KeyboardEvent): void {
    const { annotation } = item;
    switch (event.key) {
      case 'Delete':
      case 'Backspace':
        this.delete(annotation.id);
        break;
      case 'Escape':
        this.annotations.selectedId.set(null);
        this.focusDocument();
        break;
      case 'Enter':
      case 'F2':
        if (annotation.type !== 'text') {
          return;
        }
        this.edit(annotation.id);
        break;
      case 'ArrowUp':
      case 'ArrowDown':
      case 'ArrowLeft':
      case 'ArrowRight': {
        if (annotation.type !== 'text') {
          return;
        }
        const step = event.shiftKey ? 10 : 1;
        const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0;
        const dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
        this.moveNote(annotation, item.box, dx, dy);
        break;
      }
      default:
        return;
    }
    event.preventDefault();
    event.stopPropagation(); // not page navigation
  }

  protected onEditKeydown(annotation: PdfTextAnnotation, event: KeyboardEvent): void {
    event.stopPropagation(); // typing never triggers viewer shortcuts
    if (event.key === 'Escape' || (event.key === 'Enter' && (event.ctrlKey || event.metaKey))) {
      event.preventDefault();
      this.focusRequest = annotation.id;
      (event.target as HTMLElement).blur(); // commits
    }
  }

  /** Ends editing: saves the text and its measured size, or removes an empty note. */
  protected commit(item: AnnotationView, event: FocusEvent): void {
    const annotation = item.annotation as PdfTextAnnotation;
    const element = event.target as HTMLElement;
    const text = element.innerText.replace(/\n$/, '');
    this.annotations.editingId.set(null);
    if (!text.trim()) {
      this.annotations.remove(annotation.id, false);
      if (this.focusRequest === annotation.id) {
        this.focusRequest = null;
        this.focusDocument();
      }
      return;
    }
    const viewport = this.viewport();
    const scale = this.scale();
    const left = (item.box.left / 100) * viewport.width;
    const top = (item.box.top / 100) * viewport.height;
    const rect = boxToPdfRect(viewport, {
      left,
      top,
      // One extra point: the saved appearance shrinks text that does not fit its box.
      right: left + element.offsetWidth / scale + 1,
      bottom: top + element.offsetHeight / scale,
    });
    this.annotations.update(annotation.id, { text, rect });
  }

  protected setColor(annotation: PdfAnnotation, color: string): void {
    this.annotations.update(annotation.id, { color });
    if (annotation.type === 'highlight') {
      this.annotations.highlightColor.set(color);
    } else {
      this.annotations.textColor.set(color);
    }
  }

  protected changeFontSize(annotation: PdfTextAnnotation, delta: number): void {
    const fontSize = Math.min(MAX_FONT_SIZE, Math.max(MIN_FONT_SIZE, annotation.fontSize + delta));
    if (fontSize === annotation.fontSize) {
      return;
    }
    // Text scales linearly with its size: so does its box, from the top-left corner.
    const ratio = fontSize / annotation.fontSize;
    const [x1, y1, x2, y2] = annotation.rect;
    this.annotations.update(annotation.id, {
      fontSize,
      rect: [x1, y2 - (y2 - y1) * ratio, x1 + (x2 - x1) * ratio, y2],
    });
    this.annotations.fontSize.set(fontSize);
  }

  protected delete(id: string): void {
    this.annotations.remove(id);
    this.focusDocument();
  }

  /** Escape in the options toolbar: back to its annotation. */
  protected backToAnnotation(id: string, event: Event): void {
    event.preventDefault();
    event.stopPropagation();
    this.element(id)?.focus();
  }

  // ---- Pointer ----------------------------------------------------------------------------

  /** Text tool: a press on an empty area of the page writes a note there. */
  protected onSurfacePointerDown(event: PointerEvent): void {
    if (this.viewer.tool() !== 'text' || event.target !== this.host || event.button !== 0) {
      return;
    }
    event.preventDefault(); // keeps the focus for the new note
    const origin = this.host.getBoundingClientRect();
    const scale = this.scale();
    this.createTextNote((event.clientX - origin.left) / scale, (event.clientY - origin.top) / scale);
  }

  /**
   * Text tool: the default action of mousedown would move the focus to the document area,
   * taking it away from the new note (cancelling pointerdown does not prevent it).
   */
  protected onSurfaceMouseDown(event: MouseEvent): void {
    if (this.viewer.tool() === 'text' && event.target === this.host) {
      event.preventDefault();
    }
  }

  /** Press on a note: select it, and drag it to move it. */
  protected onNotePointerDown(item: AnnotationView, event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }
    event.stopPropagation();
    const annotation = item.annotation as PdfTextAnnotation;
    const element = event.currentTarget as HTMLElement;
    const start = { x: event.clientX, y: event.clientY };
    let dragging = false;
    element.setPointerCapture(event.pointerId);

    // Moves are measured from the box at the start of the drag.
    const onMove = (move: PointerEvent) => {
      const dx = move.clientX - start.x;
      const dy = move.clientY - start.y;
      dragging ||= Math.hypot(dx, dy) > DRAG_THRESHOLD_PX;
      if (dragging) {
        const scale = this.scale();
        this.moveNote(annotation, item.box, dx / scale, dy / scale);
      }
    };
    const onEnd = () => {
      element.removeEventListener('pointermove', onMove);
      element.removeEventListener('pointerup', onEnd);
      element.removeEventListener('pointercancel', onEnd);
    };
    element.addEventListener('pointermove', onMove);
    element.addEventListener('pointerup', onEnd);
    element.addEventListener('pointercancel', onEnd);
  }

  /** A press outside the annotations of the page clears the selection. */
  private onPagePointerDown(event: PointerEvent): void {
    const target = event.target as Element;
    if (!target.closest('[data-annotation-id], .annotation-toolbar')) {
      this.annotations.selectedId.set(null);
    }
  }

  /** A click (not a text selection) on a highlight selects it. */
  private onPageClick(event: MouseEvent): void {
    if (this.viewer.tool() !== 'select' || !this.host.ownerDocument.getSelection()?.isCollapsed) {
      return;
    }
    const origin = this.host.getBoundingClientRect();
    const scale = this.scale();
    const [x, y] = this.viewport().convertToPdfPoint(
      (event.clientX - origin.left) / scale,
      (event.clientY - origin.top) / scale,
    );
    const hit = this.items().find(
      ({ annotation }) => annotation.type === 'highlight' && annotation.rects.some((rect) => containsPoint(rect, x, y)),
    );
    if (hit) {
      this.element(hit.annotation.id)?.focus();
    }
  }

  // ---- Helpers ----------------------------------------------------------------------------

  /** Creates an empty note at a point in viewport coordinates (scale 1), and edits it. */
  private createTextNote(x: number, y: number): void {
    const fontSize = this.annotations.fontSize();
    const id = createAnnotationId();
    this.annotations.add({
      id,
      type: 'text',
      page: this.pageNumber(),
      color: this.annotations.textColor(),
      fontSize,
      text: '',
      rect: boxToPdfRect(this.viewport(), {
        left: x,
        top: y,
        right: x + fontSize * 4,
        bottom: y + fontSize * LINE_FACTOR,
      }),
      rotation: this.page().rotate,
    });
    this.edit(id);
    this.viewer.announce(this.messages.textNoteAdded);
  }

  /** Moves a note by a distance in viewport coordinates (scale 1), from its box `from`. */
  private moveNote(annotation: PdfTextAnnotation, from: Box, dx: number, dy: number): void {
    const viewport = this.viewport();
    const width = ((from.right - from.left) / 100) * viewport.width;
    const height = ((from.bottom - from.top) / 100) * viewport.height;
    const left = Math.min(Math.max(0, (from.left / 100) * viewport.width + dx), viewport.width - width);
    const top = Math.min(Math.max(0, (from.top / 100) * viewport.height + dy), viewport.height - height);
    this.annotations.update(annotation.id, {
      rect: boxToPdfRect(viewport, { left, top, right: left + width, bottom: top + height }),
    });
  }

  private element(id: string): HTMLElement | null {
    return this.host.querySelector<HTMLElement>(`[data-annotation-id="${id}"]`);
  }

  private focusDocument(): void {
    this.host.closest<HTMLElement>('pdfv-document-view')?.focus();
  }
}

function placeCaretAtEnd(element: HTMLElement): void {
  const selection = element.ownerDocument.getSelection();
  if (!selection) {
    return;
  }
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}
