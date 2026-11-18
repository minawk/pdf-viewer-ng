import { Component, signal } from '@angular/core';
import {
  PdfLoadedEvent,
  PdfLoadErrorEvent,
  PdfPageMode,
  PdfViewer,
  PdfViewerTheme,
} from '@minawk/pdf-viewer-ng';

interface Option<T> {
  readonly value: T;
  readonly label: string;
}

@Component({
  selector: 'app-root',
  imports: [PdfViewer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly themes: readonly Option<PdfViewerTheme>[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'high-contrast', label: 'High contrast' },
    { value: 'material', label: 'Material' },
    { value: 'auto', label: 'Auto (system)' },
    { value: 'ocean', label: 'Ocean (custom)' },
  ];

  protected readonly documents: readonly Option<string>[] = [
    { value: 'samples/sample.pdf', label: 'Sample (12 pages, mixed sizes)' },
    { value: 'samples/long.pdf', label: 'Long document (300 pages)' },
    { value: 'samples/invalid.pdf', label: 'Invalid file' },
    { value: 'samples/missing.pdf', label: 'Missing file (404)' },
  ];

  protected readonly pageModes: readonly Option<PdfPageMode>[] = [
    { value: 'continuous', label: 'Continuous (scroll)' },
    { value: 'single', label: 'Single page' },
  ];

  protected readonly theme = signal<PdfViewerTheme>('light');
  protected readonly src = signal(this.documents[0].value);
  protected readonly pageMode = signal<PdfPageMode>('continuous');
  /** Two-way bound to the viewer: follows scrolling and pager navigation, and drives the viewer. */
  protected readonly page = signal(1);
  protected readonly lastEvent = signal('');

  protected onThemeChange(event: Event): void {
    this.theme.set((event.target as HTMLSelectElement).value);
  }

  protected onPageModeChange(event: Event): void {
    this.pageMode.set((event.target as HTMLSelectElement).value as PdfPageMode);
  }

  protected onDocumentChange(event: Event): void {
    this.src.set((event.target as HTMLSelectElement).value);
  }

  protected onLoaded(event: PdfLoadedEvent): void {
    this.lastEvent.set(`loaded: ${event.pageCount} pages`);
  }

  protected onLoadError(event: PdfLoadErrorEvent): void {
    this.lastEvent.set(`loadError: ${event.kind}`);
  }
}
