import type { PdfTextContent } from '../../core/pdf-types';

/** Text of a page as one string, with where each text item (= text layer run) starts in it. */
export interface PageText {
  readonly text: string;
  /** `itemStarts[k]` is the offset of text item `k`, in text layer order. */
  readonly itemStarts: readonly number[];
  readonly itemLengths: readonly number[];
}

export interface SearchOptions {
  readonly matchCase: boolean;
  readonly wholeWord: boolean;
}

/** A match in a page, as offsets in `PageText.text`: `[start, end)`. */
export interface TextMatch {
  readonly start: number;
  readonly end: number;
}

/** A part of a text item covered by a match: `[start, end)` within the item string. */
export interface ItemRange {
  readonly item: number;
  readonly start: number;
  readonly end: number;
}

/**
 * Joins the text items of a page like the pdf.js find controller: items in order, a line
 * break after items ending a line. Marked content entries (no `str`) are skipped, exactly as
 * the text layer skips them, so item indexes match the text layer runs.
 */
export function buildPageText(content: Pick<PdfTextContent, 'items'>): PageText {
  let text = '';
  const itemStarts: number[] = [];
  const itemLengths: number[] = [];
  for (const item of content.items) {
    if (!('str' in item)) {
      continue;
    }
    itemStarts.push(text.length);
    itemLengths.push(item.str.length);
    text += item.str;
    if (item.hasEOL) {
      text += '\n';
    }
  }
  return { text, itemStarts, itemLengths };
}

/**
 * Normalizes text for matching, keeping a map back to the original offsets:
 * compatibility decomposition (ligatures: "ﬁ" -> "fi", full-width forms), then removal of
 * combining marks, so "resume" finds "résumé".
 * `map[i]` is the original offset of normalized character `i`; `map[length]` is the original length.
 */
export function normalizeForSearch(text: string): {
  readonly text: string;
  readonly map: readonly number[];
} {
  let normalized = '';
  const map: number[] = [];
  let offset = 0;
  for (const char of text) {
    const folded = char.normalize('NFKD').replace(/\p{M}/gu, '');
    for (let unit = 0; unit < folded.length; unit++) {
      map.push(offset);
    }
    normalized += folded;
    offset += char.length;
  }
  map.push(offset);
  return { text: normalized, map };
}

/** Builds the search pattern, or `null` for a query with nothing to search. */
export function searchPattern(query: string, options: SearchOptions): RegExp | null {
  const normalized = normalizeForSearch(query.trim()).text;
  if (!normalized) {
    return null;
  }
  // Any run of whitespace in the query matches any run of whitespace, line breaks included.
  const body = normalized
    .split(/\s+/u)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  const source = options.wholeWord ? `(?<![\\p{L}\\p{N}_])${body}(?![\\p{L}\\p{N}_])` : body;
  return new RegExp(source, options.matchCase ? 'gu' : 'giu');
}

/** Every match of `pattern` in a page, in original text offsets. */
export function findMatches(page: PageText, pattern: RegExp): TextMatch[] {
  const { text, map } = normalizeForSearch(page.text);
  const matches: TextMatch[] = [];
  pattern.lastIndex = 0;
  for (const match of text.matchAll(pattern)) {
    if (match[0].length === 0) {
      continue;
    }
    // The match ends where the next original character starts. A match ending inside a
    // decomposed character ("f" of "ﬁ") covers the whole original character.
    let next = match.index + match[0].length;
    while (next < map.length - 1 && map[next] === map[next - 1]) {
      next++;
    }
    matches.push({ start: map[match.index], end: map[next] });
  }
  return matches;
}

/** The parts of text items covered by a match, to highlight them in the text layer. */
export function matchItemRanges(page: PageText, match: TextMatch): ItemRange[] {
  const ranges: ItemRange[] = [];
  for (let item = 0; item < page.itemStarts.length; item++) {
    const itemStart = page.itemStarts[item];
    const itemEnd = itemStart + page.itemLengths[item];
    if (itemEnd <= match.start) {
      continue;
    }
    if (itemStart >= match.end) {
      break;
    }
    const start = Math.max(match.start, itemStart) - itemStart;
    const end = Math.min(match.end, itemEnd) - itemStart;
    if (end > start) {
      ranges.push({ item, start, end });
    }
  }
  return ranges;
}
