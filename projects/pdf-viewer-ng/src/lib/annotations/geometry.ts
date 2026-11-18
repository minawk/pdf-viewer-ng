import { PdfAnnotation, PdfRect } from './model';

/** An axis-aligned box in CSS pixels. */
export interface Box {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

/** The pdf.js `PageViewport` methods used here (at any scale). */
export interface ViewportLike {
  readonly width: number;
  readonly height: number;
  convertToPdfPoint(x: number, y: number): number[];
  convertToViewportPoint(x: number, y: number): number[];
}

/** Annotation types as pdf.js editors serialize them (`AnnotationEditorType`). */
const FREETEXT = 3;
const HIGHLIGHT = 9;

/**
 * Turns the client rectangles of a text selection into one box per line: rectangles that
 * share most of their height are merged, and boxes of consecutive lines never overlap
 * (overlaps would leave holes in the even-odd filled highlight appearance).
 */
export function mergeLineBoxes(boxes: readonly Box[]): Box[] {
  const sorted = boxes
    .filter((box) => box.right - box.left > 0.5 && box.bottom - box.top > 0.5)
    .sort((a, b) => a.top - b.top || a.left - b.left);
  const lines: Box[] = [];
  for (const box of sorted) {
    const line = lines.find((candidate) => {
      const overlap = Math.min(candidate.bottom, box.bottom) - Math.max(candidate.top, box.top);
      return overlap >= 0.5 * Math.min(candidate.bottom - candidate.top, box.bottom - box.top);
    });
    if (line) {
      lines[lines.indexOf(line)] = {
        left: Math.min(line.left, box.left),
        top: Math.min(line.top, box.top),
        right: Math.max(line.right, box.right),
        bottom: Math.max(line.bottom, box.bottom),
      };
    } else {
      lines.push(box);
    }
  }
  lines.sort((a, b) => a.top - b.top);
  for (let index = 1; index < lines.length; index++) {
    const previous = lines[index - 1];
    const current = lines[index];
    if (current.top < previous.bottom) {
      const middle = (current.top + previous.bottom) / 2;
      lines[index - 1] = { ...previous, bottom: middle };
      lines[index] = { ...current, top: middle };
    }
  }
  return lines;
}

/** A box in viewport coordinates (CSS pixels at the viewport scale) to a PDF rectangle. */
export function boxToPdfRect(viewport: ViewportLike, box: Box): PdfRect {
  const [x1, y1] = viewport.convertToPdfPoint(box.left, box.top);
  const [x2, y2] = viewport.convertToPdfPoint(box.right, box.bottom);
  return normalizeRect([x1, y1, x2, y2]);
}

/** A PDF rectangle to a box in viewport coordinates, as percentages of the page size. */
export function pdfRectToPercentBox(viewport: ViewportLike, rect: PdfRect): Box {
  const [ax, ay] = viewport.convertToViewportPoint(rect[0], rect[1]);
  const [bx, by] = viewport.convertToViewportPoint(rect[2], rect[3]);
  return {
    left: (100 * Math.min(ax, bx)) / viewport.width,
    top: (100 * Math.min(ay, by)) / viewport.height,
    right: (100 * Math.max(ax, bx)) / viewport.width,
    bottom: (100 * Math.max(ay, by)) / viewport.height,
  };
}

export function normalizeRect([x1, y1, x2, y2]: readonly number[]): PdfRect {
  return [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
}

export function boundingRect(rects: readonly PdfRect[]): PdfRect {
  return [
    Math.min(...rects.map((r) => r[0])),
    Math.min(...rects.map((r) => r[1])),
    Math.max(...rects.map((r) => r[2])),
    Math.max(...rects.map((r) => r[3])),
  ];
}

export function containsPoint(rect: PdfRect, x: number, y: number): boolean {
  return x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3];
}

/** `#rrggbb` to `[r, g, b]` (0-255), as pdf.js serializes colors. */
export function hexToRgb(color: string): [number, number, number] {
  const value = Number.parseInt(color.replace('#', '').padEnd(6, '0').slice(0, 6), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

/**
 * The annotation in the format of the pdf.js annotation editors, so that pdf.js writes it
 * into the file on `saveDocument()` and draws it when printing with the annotation storage.
 */
export function serializeAnnotation(annotation: PdfAnnotation): Record<string, unknown> {
  const pageIndex = annotation.page - 1;
  const color = hexToRgb(annotation.color);
  if (annotation.type === 'text') {
    return {
      annotationType: FREETEXT,
      pageIndex,
      rect: [...annotation.rect],
      rotation: annotation.rotation ?? 0,
      color,
      fontSize: annotation.fontSize,
      value: annotation.text,
    };
  }
  const quadPoints: number[] = [];
  const outlines: number[][] = [];
  for (const [x1, y1, x2, y2] of annotation.rects) {
    // Top-left, top-right, bottom-left, bottom-right.
    quadPoints.push(x1, y2, x2, y2, x1, y1, x2, y1);
    outlines.push([x1, y2, x2, y2, x2, y1, x1, y1]);
  }
  return {
    annotationType: HIGHLIGHT,
    pageIndex,
    rect: [...boundingRect(annotation.rects)],
    rotation: 0,
    color,
    opacity: 1,
    thickness: 12,
    quadPoints,
    outlines,
  };
}
