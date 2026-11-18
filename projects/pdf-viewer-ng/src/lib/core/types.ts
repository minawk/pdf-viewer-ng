/** Anything the viewer can load a PDF document from. */
export type PdfSource = string | URL | ArrayBuffer | Uint8Array | Blob;

/** Built-in theme names. `auto` follows the OS color-scheme preference. */
export type PdfViewerBuiltinTheme = 'light' | 'dark' | 'high-contrast' | 'material' | 'auto';

/** A built-in theme or the name of a custom theme declared with the `pdfv.theme()` Sass mixin. */
export type PdfViewerTheme = PdfViewerBuiltinTheme | (string & {});

/** Toolbar items, rendered in the order they are listed. */
export type PdfViewerTool =
  | 'pager'
  | 'zoom'
  | 'interaction'
  | 'annotate'
  | 'search'
  | 'open'
  | 'download'
  | 'print'
  | 'spacer';

/** Pointer interaction mode over the document. */
export type PdfInteractionTool = 'select' | 'pan' | 'highlight' | 'text';

/**
 * How pages are laid out:
 * - `continuous`: every page in one scrollable view; the current page follows scrolling.
 * - `single`: one page per view; the pager and keyboard move between pages.
 */
export type PdfPageMode = 'continuous' | 'single';

/** Zoom level: a preset mode or an explicit scale factor (1 = 100%). */
export type PdfZoom = 'fit-width' | 'fit-page' | 'actual' | number;

export const DEFAULT_TOOLS: readonly PdfViewerTool[] = [
  'pager',
  'spacer',
  'zoom',
  'interaction',
  'annotate',
  'spacer',
  'search',
  'open',
  'download',
  'print',
];
