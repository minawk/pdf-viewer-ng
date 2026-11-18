import { Component, computed, inject } from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../../core/messages';
import { PdfZoom } from '../../core/types';
import { ViewerStore } from '../../core/viewer-store/viewer-store';
import { Icon } from '../../icon/icon';
import { matchingPreset, ZOOM_PRESETS, zoomPercent } from '../../utils/zoom/zoom';
import { ToolbarItem } from '../roving-toolbar/roving-toolbar';

interface ZoomOption {
  readonly value: string;
  readonly label: string;
}

/** Zoom out / zoom level menu / zoom in. */
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

  /** Value of the selected option: the fit mode, the matching preset, or the custom level. */
  protected readonly selected = computed(() => {
    const zoom = this.store.zoom();
    return typeof zoom === 'number' ? String(matchingPreset(zoom) ?? zoom) : zoom;
  });

  protected readonly options = computed<readonly ZoomOption[]>(() => {
    const zoom = this.store.zoom();
    // A level reached with the wheel or a pinch (e.g. 137%) gets its own option.
    const levels =
      typeof zoom === 'number' && matchingPreset(zoom) === undefined
        ? [...ZOOM_PRESETS, zoom].sort((a, b) => a - b)
        : ZOOM_PRESETS;
    return [
      { value: 'fit-width', label: this.messages.fitWidth },
      { value: 'fit-page', label: this.messages.fitPage },
      ...levels.map((level) => ({
        value: String(level),
        label: this.messages.zoomPercent(zoomPercent(level)),
      })),
    ];
  });

  protected onSelect(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    const zoom: PdfZoom = value === 'fit-width' || value === 'fit-page' ? value : Number(value);
    this.store.setZoom(zoom);
  }
}
