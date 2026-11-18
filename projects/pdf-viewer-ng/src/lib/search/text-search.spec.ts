import {
  buildPageText,
  findMatches,
  matchItemRanges,
  normalizeForSearch,
  PageText,
  searchPattern,
  SearchOptions,
} from './text-search';

const defaults: SearchOptions = { matchCase: false, wholeWord: false };

function page(...items: (string | { str: string; hasEOL?: boolean } | { type: string })[]): PageText {
  return buildPageText({
    items: items.map((item) => (typeof item === 'string' ? { str: item, hasEOL: false } : item)),
  } as never);
}

function search(text: PageText, query: string, options: Partial<SearchOptions> = {}) {
  const pattern = searchPattern(query, { ...defaults, ...options });
  return pattern ? findMatches(text, pattern).map(({ start, end }) => text.text.slice(start, end)) : [];
}

describe('buildPageText', () => {
  it('joins text items, breaks lines, and skips marked content', () => {
    const text = page({ type: 'beginMarkedContent' }, { str: 'Hello', hasEOL: true }, 'wor', 'ld', {
      type: 'endMarkedContent',
    });
    expect(text.text).toBe('Hello\nworld');
    expect(text.itemStarts).toEqual([0, 6, 9]);
    expect(text.itemLengths).toEqual([5, 3, 2]);
  });
});

describe('normalizeForSearch', () => {
  it('expands ligatures and strips diacritics, keeping a map to original offsets', () => {
    const { text, map } = normalizeForSearch('ﬁné');
    expect(text).toBe('fine');
    expect(map).toEqual([0, 0, 1, 2, 3]);
  });
});

describe('search', () => {
  const text = page({ str: 'Signals give Angular a precise picture.', hasEOL: true }, 'SIGNALS and signal-based state.');

  it('is case-insensitive by default', () => {
    expect(search(text, 'signals')).toEqual(['Signals', 'SIGNALS']);
  });

  it('matches case on demand', () => {
    expect(search(text, 'SIGNALS', { matchCase: true })).toEqual(['SIGNALS']);
  });

  it('matches whole words on demand', () => {
    expect(search(text, 'signal')).toHaveLength(3);
    expect(search(text, 'signal', { wholeWord: true })).toEqual(['signal']);
  });

  it('matches across line breaks and runs of spaces', () => {
    expect(search(text, 'picture.   signals')).toEqual(['picture.\nSIGNALS']);
  });

  it('ignores diacritics and ligatures, and maps back to the original text', () => {
    const accented = page('Le résumé du ﬁchier');
    expect(search(accented, 'resume')).toEqual(['résumé']);
    expect(search(accented, 'fichier')).toEqual(['ﬁchier']);
    expect(search(accented, 'RÉSUMÉ')).toEqual(['résumé']);
  });

  it('treats regular expression characters literally', () => {
    expect(search(page('Price: $5 (approx.)'), '$5 (approx.)')).toEqual(['$5 (approx.)']);
    expect(search(page('a.c abc'), 'a.c')).toEqual(['a.c']);
  });

  it('finds nothing for an empty query', () => {
    expect(searchPattern('   ', defaults)).toBeNull();
  });
});

describe('matchItemRanges', () => {
  it('splits a match over the text items it covers', () => {
    const text = page('Hello wo', 'rld again');
    const [match] = findMatches(text, searchPattern('world', defaults)!);
    expect(matchItemRanges(text, match)).toEqual([
      { item: 0, start: 6, end: 8 },
      { item: 1, start: 0, end: 3 },
    ]);
  });

  it('skips the line break added between items', () => {
    const text = page({ str: 'end of', hasEOL: true }, 'line');
    const [match] = findMatches(text, searchPattern('of line', defaults)!);
    expect(matchItemRanges(text, match)).toEqual([
      { item: 0, start: 4, end: 6 },
      { item: 1, start: 0, end: 4 },
    ]);
  });
});
