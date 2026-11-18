import { PdfZoom } from '../core/types';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** CSS pixels per PDF point at 100% zoom (96 dpi screen / 72 dpi PDF). */
export const PDF_TO_CSS_UNITS = 96 / 72;
export const MIN_SCALE = 0.1;
export const MAX_SCALE = 10;
/** Space around and between pages, in CSS pixels. */
export const PAGE_GAP = 16;
/** US Letter, in PDF points: used until the first page size is known. */
export const DEFAULT_PAGE_SIZE: Size = { width: 612, height: 792 };

/**
 * Resolves a zoom setting to a render scale (CSS pixels per PDF point).
 * @param page reference page size in PDF points
 * @param container inner size of the scroll container in CSS pixels
 */
export function resolveScale(zoom: PdfZoom, page: Size, container: Size, gap = PAGE_GAP): number {
  if (typeof zoom === 'number') {
    return clampScale(zoom * PDF_TO_CSS_UNITS);
  }
  if (zoom === 'actual' || container.width <= 0 || page.width <= 0 || page.height <= 0) {
    return PDF_TO_CSS_UNITS;
  }
  const widthScale = (container.width - 2 * gap) / page.width;
  if (zoom === 'fit-width') {
    return clampScale(widthScale);
  }
  const heightScale = (container.height - 2 * gap) / page.height;
  return clampScale(Math.min(widthScale, heightScale));
}

export function clampScale(scale: number): number {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

/**
 * Canvas pixel ratio: the device pixel ratio capped by the configuration and by the maximum
 * canvas area browsers support (about 16.7 megapixels on iOS Safari).
 */
export function canvasPixelRatio(cssSize: Size, devicePixelRatio: number, maxPixelRatio: number): number {
  const MAX_CANVAS_AREA = 16_777_216;
  const ratio = Math.min(devicePixelRatio || 1, maxPixelRatio);
  const area = cssSize.width * cssSize.height;
  if (area <= 0) {
    return ratio;
  }
  return Math.min(ratio, Math.sqrt(MAX_CANVAS_AREA / area));
}
