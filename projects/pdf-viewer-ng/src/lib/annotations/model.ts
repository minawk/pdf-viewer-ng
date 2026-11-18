/**
 * A rectangle in PDF user space: `[x1, y1, x2, y2]` in points, origin at the bottom-left
 * corner of the page, `x1 <= x2` and `y1 <= y2` (the PDF `/Rect` convention).
 * Independent of zoom, so annotations stay in place at every zoom level.
 */
export type PdfRect = readonly [number, number, number, number];

interface PdfAnnotationBase {
  /** Unique identifier, generated when the annotation is created. */
  readonly id: string;
  /** 1-based page number. */
  readonly page: number;
  /** CSS hex color, `#rrggbb`. */
  readonly color: string;
}

/** Highlighted text: one rectangle per line. */
export interface PdfHighlightAnnotation extends PdfAnnotationBase {
  readonly type: 'highlight';
  readonly rects: readonly PdfRect[];
  /** The highlighted text, used as accessible name. */
  readonly text: string;
}

/** A free text note written on the page. */
export interface PdfTextAnnotation extends PdfAnnotationBase {
  readonly type: 'text';
  /** Box of the text; its top-left corner is where the text starts. */
  readonly rect: PdfRect;
  readonly text: string;
  /** Font size in points. */
  readonly fontSize: number;
  /** Rotation of the page when the note was written, so the text is saved upright. */
  readonly rotation?: number;
}

export type PdfAnnotation = PdfHighlightAnnotation | PdfTextAnnotation;

export interface AnnotationColor {
  readonly value: string;
  /** Key in `PdfViewerMessages.colorNames`. */
  readonly name: AnnotationColorName;
}

export type AnnotationColorName = 'yellow' | 'green' | 'blue' | 'pink' | 'red' | 'black';

/** The pdf.js highlight palette: light colors, applied with a multiply blend. */
export const HIGHLIGHT_COLORS: readonly AnnotationColor[] = [
  { value: '#ffff98', name: 'yellow' },
  { value: '#53ffbc', name: 'green' },
  { value: '#80ebff', name: 'blue' },
  { value: '#ffcbe6', name: 'pink' },
  { value: '#ff4f5f', name: 'red' },
];

/** Text colors, all with at least 4.5:1 contrast on white paper. */
export const TEXT_COLORS: readonly AnnotationColor[] = [
  { value: '#000000', name: 'black' },
  { value: '#c62828', name: 'red' },
  { value: '#1565c0', name: 'blue' },
  { value: '#2e7d32', name: 'green' },
];

export const DEFAULT_FONT_SIZE = 12;
export const MIN_FONT_SIZE = 6;
export const MAX_FONT_SIZE = 72;

let counter = 0;

/** A new annotation id, unique in the page session. */
export function createAnnotationId(): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${(counter++).toString(36)}`;
  return `pdfv-${random}`;
}
