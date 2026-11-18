import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';

/** Every user-facing string of the viewer, including accessible names. Override for i18n. */
export interface PdfViewerMessages {
  readonly viewerLabel: string;
  readonly toolbarLabel: string;
  readonly documentLabel: string;
  readonly noDocument: string;

  readonly pagerGroup: string;
  readonly firstPage: string;
  readonly previousPage: string;
  readonly nextPage: string;
  readonly lastPage: string;
  readonly pageNumber: string;
  readonly pageTotal: (total: number) => string;

  readonly zoomGroup: string;
  readonly zoomIn: string;
  readonly zoomOut: string;
  readonly zoomLevel: string;
  readonly fitWidth: string;
  readonly fitPage: string;
  readonly actualSize: string;

  readonly interactionGroup: string;
  readonly selectTool: string;
  readonly panTool: string;

  readonly annotateGroup: string;
  readonly highlightTool: string;
  readonly textTool: string;

  readonly search: string;
  readonly open: string;
  readonly download: string;
  readonly print: string;
}

export const DEFAULT_PDF_VIEWER_MESSAGES: PdfViewerMessages = {
  viewerLabel: 'PDF viewer',
  toolbarLabel: 'PDF viewer toolbar',
  documentLabel: 'PDF document',
  noDocument: 'No document loaded.',

  pagerGroup: 'Pages',
  firstPage: 'First page',
  previousPage: 'Previous page',
  nextPage: 'Next page',
  lastPage: 'Last page',
  pageNumber: 'Page number',
  pageTotal: (total) => `of ${total}`,

  zoomGroup: 'Zoom',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  zoomLevel: 'Zoom level',
  fitWidth: 'Fit to width',
  fitPage: 'Fit to page',
  actualSize: 'Actual size',

  interactionGroup: 'Interaction mode',
  selectTool: 'Select text',
  panTool: 'Pan',

  annotateGroup: 'Annotations',
  highlightTool: 'Highlight',
  textTool: 'Add text',

  search: 'Search',
  open: 'Open file',
  download: 'Download',
  print: 'Print',
};

export const PDF_VIEWER_MESSAGES = new InjectionToken<PdfViewerMessages>('PDF_VIEWER_MESSAGES', {
  providedIn: 'root',
  factory: () => DEFAULT_PDF_VIEWER_MESSAGES,
});

/** Overrides some or all viewer strings (translations, custom wording). */
export function providePdfViewerMessages(messages: Partial<PdfViewerMessages>): EnvironmentProviders {
  return makeEnvironmentProviders([
    { provide: PDF_VIEWER_MESSAGES, useValue: { ...DEFAULT_PDF_VIEWER_MESSAGES, ...messages } },
  ]);
}
