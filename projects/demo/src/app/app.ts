import { Component, signal } from '@angular/core';
import { PdfViewer, PdfViewerTheme } from '@minawk/pdf-viewer-ng';

interface ThemeOption {
  readonly value: PdfViewerTheme;
  readonly label: string;
}

@Component({
  selector: 'app-root',
  imports: [PdfViewer],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly themes: readonly ThemeOption[] = [
    { value: 'light', label: 'Light' },
    { value: 'dark', label: 'Dark' },
    { value: 'high-contrast', label: 'High contrast' },
    { value: 'material', label: 'Material' },
    { value: 'auto', label: 'Auto (system)' },
    { value: 'ocean', label: 'Ocean (custom)' },
  ];

  protected readonly theme = signal<PdfViewerTheme>('light');

  protected onThemeChange(event: Event): void {
    this.theme.set((event.target as HTMLSelectElement).value);
  }
}
