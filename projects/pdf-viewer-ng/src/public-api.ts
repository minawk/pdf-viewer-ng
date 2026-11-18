/*
 * Public API Surface of @minawk/pdf-viewer-ng
 */

export { PdfViewer } from './lib/viewer/pdf-viewer';

export {
  DEFAULT_PDF_VIEWER_CONFIG,
  PDF_VIEWER_CONFIG,
  providePdfViewer,
  type PdfViewerConfig,
} from './lib/core/config';
export {
  DEFAULT_PDF_VIEWER_MESSAGES,
  PDF_VIEWER_MESSAGES,
  providePdfViewerMessages,
  type PdfViewerMessages,
} from './lib/core/messages';
export {
  DEFAULT_TOOLS,
  type PdfInteractionTool,
  type PdfSource,
  type PdfViewerBuiltinTheme,
  type PdfViewerTheme,
  type PdfViewerTool,
  type PdfZoom,
} from './lib/core/types';
