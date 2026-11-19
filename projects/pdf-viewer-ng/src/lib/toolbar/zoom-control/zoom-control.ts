import { Component, computed, inject } from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../../core/messages';
import { ViewerStore } from '../../core/viewer-store/viewer-store';
import { Icon } from '../../icon/icon';
import { parseZoomPercent, zoomPercent } from '../../utils/zoom/zoom';
import { ToolbarItem } from '../roving-toolbar/roving-toolbar';

/**
 * Zoom out / zoom level field / zoom in / fit toggle, like the Chrome PDF viewer.
 * The field shows the zoom actually applied ("125%"), accepts a typed percentage, and
 * steps with the up and down arrow keys.
 */
@Component({
  selector: 'pdfv-zoom-control',
  imports: [Icon, ToolbarItem],
  templateUrl: './zoom-control.html',
  styleUrl: './zoom-control.scss',
  host: {
    role: 'group',
    '[attr.aria-label]': 'messages.zoomGroup',
  },
})
export class ZoomControl {
  protected readonly store = inject(ViewerStore);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);

  /** Applied zoom, fit modes included, as shown in the field. */
  protected readonly level = computed(() =>
    this.messages.zoomPercent(zoomPercent(this.store.effectiveZoom())),
  );

  /** The fit button switches between fit to page and fit to width, as in Chrome. */
  protected readonly fitsPage = computed(() => this.store.zoom() === 'fit-page');
  protected readonly fitLabel = computed(() =>
    this.fitsPage() ? this.messages.fitWidth : this.messages.fitPage,
  );

  protected toggleFit(): void {
    this.store.setZoom(this.fitsPage() ? 'fit-width' : 'fit-page');
  }

  /** Applies the typed level, or restores the current one if it is not a number. */
  protected commit(input: HTMLInputElement): void {
    const zoom = parseZoomPercent(input.value);
    if (zoom !== null) {
      this.store.setZoom(zoom);
    }
    input.value = this.level();
  }

  protected revert(input: HTMLInputElement): void {
    input.value = this.level();
    input.select();
  }

  /** Up and down arrows step through the zoom levels, like the + and - buttons. */
  protected step(input: HTMLInputElement, event: Event, direction: 1 | -1): void {
    event.preventDefault();
    if (direction > 0) {
      this.store.zoomIn();
    } else {
      this.store.zoomOut();
    }
    input.value = this.level();
    input.select();
  }
}
