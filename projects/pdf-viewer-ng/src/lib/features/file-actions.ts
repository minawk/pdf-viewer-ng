import { DOCUMENT, inject, Injectable } from '@angular/core';
import { Subject } from 'rxjs';
import { PDF_VIEWER_MESSAGES } from '../core/messages';
import { ViewerStore } from '../core/viewer-store/viewer-store';
import { isPdfFile } from '../utils/file-name/file-name';

export interface PdfDownloadEvent {
  readonly fileName: string;
  /** Size of the downloaded file, in bytes. */
  readonly size: number;
}

/** Open a local file, download the document. One instance per viewer. */
@Injectable()
export class FileActions {
  private readonly store = inject(ViewerStore);
  private readonly messages = inject(PDF_VIEWER_MESSAGES);
  private readonly document = inject(DOCUMENT);

  readonly opened$ = new Subject<File>();
  readonly downloaded$ = new Subject<PdfDownloadEvent>();

  /** Shows the system file picker, then opens the chosen PDF. */
  pick(): void {
    // A temporary input: nothing stays in the viewer's DOM or tab order.
    const input = this.document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,.pdf';
    input.hidden = true;
    const done = () => input.remove();
    input.addEventListener(
      'change',
      () => {
        const file = input.files?.[0];
        done();
        if (file) {
          this.open(file);
        }
      },
      { once: true },
    );
    input.addEventListener('cancel', done, { once: true });
    this.document.body.append(input);
    input.click();
  }

  /** Opens a local file in place of the current document. Returns `false` if it is not a PDF. */
  open(file: File): boolean {
    if (!isPdfFile(file)) {
      this.store.announce(this.messages.notAPdf);
      return false;
    }
    this.store.source.set(file);
    this.opened$.next(file);
    return true;
  }

  /** Saves the document, edits included, under `store.fileName()`. */
  async download(): Promise<void> {
    const pdf = this.store.document();
    if (!pdf) {
      return;
    }
    try {
      // Only re-serialize the file when it was edited: otherwise the original bytes, untouched.
      const data = pdf.annotationStorage.size > 0 ? await pdf.saveDocument() : await pdf.getData();
      const fileName = this.store.fileName();
      saveFile(this.document, new Blob([data as BlobPart], { type: 'application/pdf' }), fileName);
      this.downloaded$.next({ fileName, size: data.byteLength });
    } catch (error) {
      console.error('[pdf-viewer-ng] Download failed', error);
      this.store.announce(this.messages.downloadFailed);
    }
  }
}

/** Triggers a browser download of a blob. */
export function saveFile(document: Document, blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked later: some browsers start reading the blob asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
