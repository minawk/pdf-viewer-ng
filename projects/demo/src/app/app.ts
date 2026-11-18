import { Component, computed, signal } from '@angular/core';
import {
  PdfAnnotation,
  PdfDownloadEvent,
  PdfLoadedEvent,
  PdfLoadErrorEvent,
  PdfPageMode,
  PdfViewer,
  PdfViewerTheme,
  PdfZoom,
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
  /** Two-way bound zoom: 'fit-width', 'fit-page' or a factor (1 = 100%). */
  protected readonly zoom = signal<PdfZoom | undefined>(undefined);
  protected readonly zoomLabel = computed(() => {
    const zoom = this.zoom();
    return typeof zoom === 'number' ? `${Math.round(zoom * 100)}%` : (zoom ?? '');
  });
  protected readonly lastEvent = signal('');
  /** Two-way bound: an application would store them, e.g. per document on its server. */
  protected readonly annotations = signal<readonly PdfAnnotation[] | undefined>(undefined);

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

  protected onFileOpened(file: File): void {
    this.lastEvent.set(`fileOpened: ${file.name}`);
  }

  protected onDownloaded(event: PdfDownloadEvent): void {
    this.lastEvent.set(`downloaded: ${event.fileName} (${Math.round(event.size / 1024)} kB)`);
  }

  protected onLoadError(event: PdfLoadErrorEvent): void {
    this.lastEvent.set(`loadError: ${event.kind}`);
  }
}
