import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { providePdfViewer } from '@minawk/pdf-viewer-ng';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    providePdfViewer({ workerSrc: 'assets/pdfjs/pdf.worker.min.mjs' }),
  ],
};
