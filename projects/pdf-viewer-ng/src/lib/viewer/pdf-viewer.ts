import {
  afterRenderEffect,
  Component,
  computed,
  ElementRef,
  inject,
  input,
  isDevMode,
} from '@angular/core';
import { PDF_VIEWER_CONFIG } from '../core/config';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { PdfViewerTheme, PdfViewerTool } from '../core/types';
import { ViewerStore } from '../core/viewer-store';
import { Toolbar } from '../toolbar/toolbar';

@Component({
  selector: 'pdfv-viewer',
  imports: [Toolbar],
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

  /** Theme name: a built-in theme or a custom one. Defaults to the `providePdfViewer()` theme. */
  readonly theme = input<PdfViewerTheme | undefined>(undefined);
  /** Toolbar items, in display order. Pass an empty array to hide the toolbar. */
  readonly tools = input<readonly PdfViewerTool[] | undefined>(undefined);

  protected readonly resolvedTheme = computed(() => this.theme() ?? this.config.theme);
  protected readonly resolvedTools = computed(() => this.tools() ?? this.config.tools);

  constructor() {
    if (isDevMode()) {
      this.warnOnMissingTheme();
    }
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
