import { Component, computed, input } from '@angular/core';
import { PDFV_ICONS, PdfvIconName } from './icons';

/** Decorative inline SVG icon. The accessible name always belongs to the parent control. */
@Component({
  selector: 'pdfv-icon',
  templateUrl: './icon.html',
  styleUrl: './icon.scss',
  host: { 'aria-hidden': 'true' },
})
export class Icon {
  readonly name = input.required<PdfvIconName>();
  protected readonly path = computed(() => PDFV_ICONS[this.name()]);
}
