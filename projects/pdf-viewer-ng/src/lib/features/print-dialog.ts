import { afterNextRender, Component, computed, DestroyRef, DOCUMENT, ElementRef, inject, viewChild } from '@angular/core';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { PrintService } from './print';

let nextId = 0;

/**
 * Modal progress dialog shown while pages are rendered for printing. A native `<dialog>`:
 * focus is trapped inside, Escape cancels, focus returns where it was when it closes.
 */
@Component({
  selector: 'pdfv-print-dialog',
  templateUrl: './print-dialog.html',
  styleUrl: './print-dialog.scss',
})
export class PrintDialog {
  protected readonly printer = inject(PrintService);
  protected readonly messages = inject(PDF_VIEWER_MESSAGES);
  protected readonly titleId = `pdfv-print-title-${nextId++}`;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly percent = computed(() => {
    const progress = this.printer.progress();
    return progress && progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;
  });

  protected readonly progressText = computed(() => {
    const progress = this.printer.progress();
    return progress ? this.messages.printProgress(progress.done, progress.total) : '';
  });

  constructor() {
    const document = inject(DOCUMENT);
    let previousFocus: HTMLElement | null = null;
    afterNextRender(() => {
      previousFocus = document.activeElement as HTMLElement | null;
      this.dialog().nativeElement.showModal();
    });
    // The dialog leaves the DOM with this component, before the browser could restore focus:
    // give it back to the control that started printing.
    inject(DestroyRef).onDestroy(() => {
      this.dialog().nativeElement.close();
      if (previousFocus?.isConnected) {
        previousFocus.focus();
      }
    });
  }

  /** Escape key: cancel printing (the dialog closes when the service stops). */
  protected onCancel(event: Event): void {
    event.preventDefault();
    this.printer.cancel();
  }
}
