import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PdfTextContent } from '../../core/pdf-types';

/** A link of a page, as read from its pdf.js link annotation. */
export interface PdfLink {
  /** `[x1, y1, x2, y2]` in PDF points. */
  readonly rect: readonly number[];
  /** Safe external URL (http, https, ftp, mailto, tel): pdf.js drops any other protocol. */
  readonly url?: string;
  /** In-document target: a named destination or an explicit destination array. */
  readonly dest?: string | readonly unknown[];
}

/** The links of a page among its pdf.js annotations; unsafe or empty links are left out. */
export function pageLinks(annotations: readonly unknown[]): PdfLink[] {
  return annotations.flatMap((annotation): PdfLink[] => {
    const candidate = annotation as {
      subtype?: string;
      rect?: number[];
      url?: string;
      dest?: PdfLink['dest'];
    };
    if (candidate.subtype !== 'Link' || !Array.isArray(candidate.rect)) {
      return [];
    }
    if (candidate.url) {
      return [{ rect: candidate.rect, url: candidate.url }];
    }
    if (typeof candidate.dest === 'string' || Array.isArray(candidate.dest)) {
      return [{ rect: candidate.rect, dest: candidate.dest }];
    }
    return [];
  });
}

/** The text drawn inside a rectangle of the page: the visible label of a link. */
export function textInRect(
  content: Pick<PdfTextContent, 'items'>,
  rect: readonly number[],
): string {
  const tolerance = 2;
  const [x1, y1, x2, y2] = rect;
  return content.items
    .flatMap((item) => {
      if (!('str' in item) || !item.str.trim()) {
        return [];
      }
      // Text items start at their baseline origin, in PDF points.
      const [x, y] = [item.transform[4] as number, item.transform[5] as number];
      const inside =
        x >= x1 - tolerance && x <= x2 + tolerance && y >= y1 - tolerance && y <= y2 + tolerance;
      return inside ? [item.str] : [];
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Web and FTP links open in a new tab; mailto: and tel: hand over to the system. */
export function opensInNewTab(url: string): boolean {
  return /^(https?|ftp):/i.test(url);
}

/** A URL as people read it: without `mailto:` or `tel:`. */
export function readableUrl(url: string): string {
  return url.replace(/^(mailto|tel):/i, '');
}

/** 0-based index of the page a destination points to, or `null` if it cannot be resolved. */
export async function destinationPageIndex(
  pdf: Pick<PDFDocumentProxy, 'getDestination' | 'getPageIndex'>,
  dest: string | readonly unknown[],
): Promise<number | null> {
  try {
    const explicit = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
    const target = explicit?.[0];
    if (Number.isInteger(target)) {
      return target as number;
    }
    if (target && typeof target === 'object' && 'num' in target) {
      return await pdf.getPageIndex(target as Parameters<PDFDocumentProxy['getPageIndex']>[0]);
    }
  } catch {
    // A broken destination is ignored, like in other viewers.
  }
  return null;
}
