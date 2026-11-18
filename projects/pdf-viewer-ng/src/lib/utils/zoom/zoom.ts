import { PdfZoom } from '../../core/types';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/** CSS pixels per PDF point at 100% zoom (96 dpi screen / 72 dpi PDF). */
export const PDF_TO_CSS_UNITS = 96 / 72;
/** Zoom bounds, as factors of the actual size (1 = 100%). */
export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;
/** Levels offered by the zoom menu and used by the zoom in/out buttons. */
export const ZOOM_PRESETS: readonly number[] = [0.1, 0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
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
    return clampZoom(zoom) * PDF_TO_CSS_UNITS;
  }
  if (container.width <= 0 || page.width <= 0 || page.height <= 0) {
    return PDF_TO_CSS_UNITS;
  }
  const widthScale = (container.width - 2 * gap) / page.width;
  const scale =
    zoom === 'fit-width'
      ? widthScale
      : Math.min(widthScale, (container.height - 2 * gap) / page.height);
  return clampZoom(scale / PDF_TO_CSS_UNITS) * PDF_TO_CSS_UNITS;
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) {
    return 1;
  }
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Next preset level strictly above (`direction` 1) or below (-1) the current zoom,
 * or the bound when there is none.
 */
export function stepZoom(current: number, direction: 1 | -1): number {
  // A step always changes the zoom visibly: 124.9% (fit to width) zooms in to 150%, not 125%.
  const minimumStep = 1.05;
  if (direction > 0) {
    return ZOOM_PRESETS.find((level) => level > current * minimumStep) ?? MAX_ZOOM;
  }
  return [...ZOOM_PRESETS].reverse().find((level) => level < current / minimumStep) ?? MIN_ZOOM;
}

/** The preset level within 1% of `zoom`, if any. */
export function matchingPreset(zoom: number): number | undefined {
  return ZOOM_PRESETS.find((level) => Math.abs(level - zoom) <= level * 0.01);
}

/** Zoom factor as a rounded percentage, e.g. 1.254 -> 125. */
export function zoomPercent(zoom: number): number {
  return Math.round(zoom * 100);
}

/**
 * Canvas pixel ratio: the device pixel ratio capped by the configuration and by the maximum
 * canvas area browsers support (about 16.7 megapixels on iOS Safari).
 */
export function canvasPixelRatio(
  cssSize: Size,
  devicePixelRatio: number,
  maxPixelRatio: number,
): number {
  const MAX_CANVAS_AREA = 16_777_216;
  const ratio = Math.min(devicePixelRatio || 1, maxPixelRatio);
  const area = cssSize.width * cssSize.height;
  if (area <= 0) {
    return ratio;
  }
  return Math.min(ratio, Math.sqrt(MAX_CANVAS_AREA / area));
}
