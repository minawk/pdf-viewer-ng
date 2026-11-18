import { EnvironmentProviders, InjectionToken, makeEnvironmentProviders } from '@angular/core';
import { PdfLoadErrorKind } from './errors';

/** Every user-facing string of the viewer, including accessible names. Override for i18n. */
export interface PdfViewerMessages {
  readonly viewerLabel: string;
  readonly toolbarLabel: string;
  readonly documentLabel: string;
  readonly noDocument: string;
  readonly loading: string;
  readonly documentLoaded: (pageCount: number) => string;
  readonly loadErrors: Readonly<Record<PdfLoadErrorKind, string>>;
  readonly retry: string;
  readonly pageLabel: (page: number, total: number) => string;
  readonly pageRenderError: string;

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
  readonly zoomPercent: (percent: number) => string;
  /** Announced after a zoom change made with the toolbar or the keyboard. */
  readonly zoomChanged: (level: string) => string;

  readonly interactionGroup: string;
  readonly selectTool: string;
  readonly panTool: string;

  readonly annotateGroup: string;
  readonly highlightTool: string;
  readonly textTool: string;

  readonly search: string;
  readonly searchLabel: string;
  readonly searchPlaceholder: string;
  readonly matchCase: string;
  readonly wholeWord: string;
  readonly previousResult: string;
  readonly nextResult: string;
  readonly closeSearch: string;
  readonly searching: string;
  readonly noResults: string;
  /** Visible result counter, e.g. "3 of 12". */
  readonly searchCount: (position: number, total: number) => string;
  /** Announced when moving between results, e.g. "Result 3 of 12". */
  readonly searchResult: (position: number, total: number) => string;
  readonly searchResults: (total: number) => string;
  readonly open: string;
  readonly download: string;
  readonly print: string;
}

export const DEFAULT_PDF_VIEWER_MESSAGES: PdfViewerMessages = {
  viewerLabel: 'PDF viewer',
  toolbarLabel: 'PDF viewer toolbar',
  documentLabel: 'PDF document',
  noDocument: 'No document loaded.',
  loading: 'Loading document…',
  documentLoaded: (pageCount) => `Document loaded, ${pageCount} ${pageCount === 1 ? 'page' : 'pages'}.`,
  loadErrors: {
    invalid: 'This file is not a valid PDF document.',
    missing: 'The document could not be found or downloaded.',
    password: 'This document is password-protected and cannot be opened.',
    unknown: 'The document could not be opened.',
  },
  retry: 'Try again',
  pageLabel: (page, total) => `Page ${page} of ${total}`,
  pageRenderError: 'This page could not be displayed.',

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
  zoomPercent: (percent) => `${percent}%`,
  zoomChanged: (level) => `Zoom: ${level}`,

  interactionGroup: 'Interaction mode',
  selectTool: 'Select text',
  panTool: 'Pan',

  annotateGroup: 'Annotations',
  highlightTool: 'Highlight',
  textTool: 'Add text',

  search: 'Search',
  searchLabel: 'Search in document',
  searchPlaceholder: 'Search',
  matchCase: 'Match case',
  wholeWord: 'Whole words',
  previousResult: 'Previous result',
  nextResult: 'Next result',
  closeSearch: 'Close search',
  searching: 'Searching…',
  noResults: 'No results',
  searchCount: (position, total) => `${position} of ${total}`,
  searchResult: (position, total) => `Result ${position} of ${total}`,
  searchResults: (total) => (total === 1 ? '1 result' : `${total} results`),
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
