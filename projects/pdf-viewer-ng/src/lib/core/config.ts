import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { DEFAULT_TOOLS, PdfPageMode, PdfViewerTheme, PdfViewerTool } from './types';

export interface PdfViewerConfig {
  /**
   * URL of the pdf.js worker script. Copy it into your build with this
   * angular.json asset entry:
   * `{ "glob": "pdf.worker.min.mjs", "input": "node_modules/pdfjs-dist/build", "output": "assets/pdfjs" }`
   */
  readonly workerSrc: string;
  /**
   * Optional base URL of the pdf.js data folders (`cmaps/`, `standard_fonts/`, `wasm/`, `iccs/`),
   * copied from `node_modules/pdfjs-dist`. They improve rendering of PDFs with CJK text,
   * non-embedded standard fonts, JPEG 2000/JBIG2 images and ICC color profiles.
   * `null` disables them; pdf.js then falls back to system fonts.
   */
  readonly assetsUrl: string | null;
  /** Theme used when the viewer's `theme` input is not set. */
  readonly theme: PdfViewerTheme;
  /** Toolbar items used when the viewer's `tools` input is not set. */
  readonly tools: readonly PdfViewerTool[];
  /** Page layout used when the viewer's `pageMode` input is not set. */
  readonly pageMode: PdfPageMode;
  /** Upper bound for the canvas pixel ratio, to limit memory use on high-DPI screens. */
  readonly maxPixelRatio: number;
}

export const DEFAULT_PDF_VIEWER_CONFIG: PdfViewerConfig = {
  workerSrc: 'assets/pdfjs/pdf.worker.min.mjs',
  assetsUrl: null,
  theme: 'light',
  tools: DEFAULT_TOOLS,
  pageMode: 'continuous',
  maxPixelRatio: 2,
};

export const PDF_VIEWER_CONFIG = new InjectionToken<PdfViewerConfig>('PDF_VIEWER_CONFIG', {
  providedIn: 'root',
  factory: () => DEFAULT_PDF_VIEWER_CONFIG,
});

/** Application-wide configuration of every `<pdfv-viewer>`. */
export function providePdfViewer(config: Partial<PdfViewerConfig> = {}): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: PDF_VIEWER_CONFIG, useValue: { ...DEFAULT_PDF_VIEWER_CONFIG, ...config } },
  ]);
}
