import { DestroyRef, DOCUMENT, inject, Injectable } from '@angular/core';

/** Class set on a text layer while a selection is made in it. */
export const SELECTING_CLASS = 'selecting';

/**
 * Keeps text selection stable while dragging across text layers (port of the pdf.js viewer
 * behaviour). A layer marked as `selecting` stretches an invisible "end of content" element
 * over the whole page, so moving the pointer over blank areas between text runs does not
 * make the selection jump to the end of the page.
 *
 * One instance per document view: document listeners are attached only while text layers exist.
 */
@Injectable()
export class TextSelection {
  private readonly document = inject(DOCUMENT);
  private readonly layers = new Set<HTMLElement>();
  private listeners: AbortController | null = null;
  private pointerDown = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.listeners?.abort());
  }

  register(layer: HTMLElement): void {
    this.layers.add(layer);
    layer.addEventListener('mousedown', () => layer.classList.add(SELECTING_CLASS));
    this.listen();
  }

  unregister(layer: HTMLElement): void {
    this.layers.delete(layer);
    if (this.layers.size === 0) {
      this.listeners?.abort();
      this.listeners = null;
    }
  }

  private listen(): void {
    if (this.listeners) {
      return;
    }
    this.listeners = new AbortController();
    const { signal } = this.listeners;
    const resetAll = () => this.layers.forEach((layer) => layer.classList.remove(SELECTING_CLASS));

    this.document.addEventListener('pointerdown', () => (this.pointerDown = true), { signal });
    this.document.addEventListener(
      'pointerup',
      () => {
        this.pointerDown = false;
        resetAll();
      },
      { signal },
    );
    this.document.addEventListener('keyup', () => !this.pointerDown && resetAll(), { signal });
    this.document.defaultView?.addEventListener(
      'blur',
      () => {
        this.pointerDown = false;
        resetAll();
      },
      { signal },
    );
    this.document.addEventListener('selectionchange', () => this.onSelectionChange(), { signal });
  }

  /** Marks the layers the selection runs through; resets the others. */
  private onSelectionChange(): void {
    const selection = this.document.getSelection();
    const active = new Set<HTMLElement>();
    for (let index = 0; selection && index < selection.rangeCount; index++) {
      const range = selection.getRangeAt(index);
      if (range.collapsed && !this.pointerDown) {
        continue;
      }
      for (const layer of this.layers) {
        if (range.intersectsNode(layer)) {
          active.add(layer);
        }
      }
    }
    for (const layer of this.layers) {
      layer.classList.toggle(SELECTING_CLASS, active.has(layer));
    }
  }
}
