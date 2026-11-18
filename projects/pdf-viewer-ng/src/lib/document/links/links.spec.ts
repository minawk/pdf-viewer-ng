import { destinationPageIndex, opensInNewTab, pageLinks, readableUrl, textInRect } from './links';

describe('pageLinks', () => {
  it('keeps safe external links and in-document links, drops the others', () => {
    const links = pageLinks([
      {
        subtype: 'Link',
        rect: [0, 0, 10, 10],
        url: 'https://example.com',
        unsafeUrl: 'https://example.com',
      },
      { subtype: 'Link', rect: [0, 0, 10, 10], dest: 'chapter-3' },
      {
        subtype: 'Link',
        rect: [0, 0, 10, 10],
        dest: [{ num: 7, gen: 0 }, { name: 'XYZ' }, 0, 792, null],
      },
      { subtype: 'Link', rect: [0, 0, 10, 10], unsafeUrl: 'javascript:alert(1)' },
      { subtype: 'Highlight', rect: [0, 0, 10, 10] },
    ]);
    expect(links.map((link) => link.url ?? link.dest)).toEqual([
      'https://example.com',
      'chapter-3',
      [{ num: 7, gen: 0 }, { name: 'XYZ' }, 0, 792, null],
    ]);
  });
});

describe('textInRect', () => {
  const item = (str: string, x: number, y: number) => ({ str, transform: [12, 0, 0, 12, x, y] });

  it('returns the text drawn inside the link', () => {
    const content = {
      items: [item('Project', 56, 550), item('on GitHub', 100, 550), item('Elsewhere', 56, 400)],
    };
    expect(textInRect(content as never, [56, 547, 162, 561])).toBe('Project on GitHub');
  });

  it('is empty when no text is under the link', () => {
    expect(textInRect({ items: [item('Far', 300, 300)] } as never, [0, 0, 10, 10])).toBe('');
  });
});

describe('url helpers', () => {
  it('opens web links in a new tab, not mail or phone links', () => {
    expect(opensInNewTab('https://example.com')).toBe(true);
    expect(opensInNewTab('mailto:hello@example.com')).toBe(false);
    expect(opensInNewTab('tel:+33123456789')).toBe(false);
  });

  it('reads mail and phone links without their scheme', () => {
    expect(readableUrl('mailto:hello@example.com')).toBe('hello@example.com');
    expect(readableUrl('tel:+33123456789')).toBe('+33123456789');
    expect(readableUrl('https://example.com')).toBe('https://example.com');
  });
});

describe('destinationPageIndex', () => {
  const pdf = {
    getDestination: vi.fn(async (name: string) =>
      name === 'chapter-3' ? [{ num: 8, gen: 0 }, { name: 'XYZ' }] : null,
    ),
    getPageIndex: vi.fn(async (ref: { num: number }) => ref.num - 6),
  };

  it('resolves explicit, named and numeric destinations', async () => {
    expect(await destinationPageIndex(pdf as never, [{ num: 7, gen: 0 }, { name: 'XYZ' }])).toBe(1);
    expect(await destinationPageIndex(pdf as never, 'chapter-3')).toBe(2);
    expect(await destinationPageIndex(pdf as never, [4, { name: 'Fit' }])).toBe(4);
  });

  it('returns null for unknown destinations', async () => {
    expect(await destinationPageIndex(pdf as never, 'missing')).toBeNull();
    pdf.getPageIndex.mockRejectedValueOnce(new Error('bad ref'));
    expect(await destinationPageIndex(pdf as never, [{ num: 99, gen: 0 }])).toBeNull();
  });
});
