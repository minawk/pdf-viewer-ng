import { ApplicationRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PDF_TO_CSS_UNITS } from '../utils/zoom';
import { OpenDocumentOptions, PdfEngine } from './pdf-engine';
import { PdfPageMode, PdfSource, PdfZoom } from './types';
import { ViewerStore } from './viewer-store';

function fakePdf(numPages: number, landscapePages: number[] = []) {
  const getTextContent = vi.fn((pageNumber: number) =>
    Promise.resolve({ items: [{ str: `Text of page ${pageNumber}` }], styles: {}, lang: 'en' }),
  );
  return {
    numPages,
    getTextContent,
    getPage: vi.fn((pageNumber: number) =>
      Promise.resolve({
        pageNumber,
        getViewport: ({ scale }: { scale: number }) =>
          landscapePages.includes(pageNumber)
            ? { width: 800 * scale, height: 600 * scale }
            : { width: 600 * scale, height: 800 * scale },
        getTextContent: () => getTextContent(pageNumber),
      }),
    ),
    loadingTask: { destroy: vi.fn(() => Promise.resolve()) },
  };
}

function connect(
  store: ViewerStore,
  src: () => PdfSource | null,
  pageMode: () => PdfPageMode | undefined = () => undefined,
  zoom: () => PdfZoom | undefined = () => undefined,
) {
  store.connect({ src, pageMode, zoom });
}

describe('ViewerStore', () => {
  let open: ReturnType<typeof vi.fn<(source: PdfSource, options: OpenDocumentOptions) => Promise<unknown>>>;

  function setup(platform = 'browser') {
    open = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        ViewerStore,
        { provide: PdfEngine, useValue: { open } },
        { provide: PLATFORM_ID, useValue: platform },
      ],
    });
    const store = TestBed.inject(ViewerStore);
    const settle = () => TestBed.inject(ApplicationRef).whenStable();
    return { store, settle };
  }

  it('is idle without a source', async () => {
    const { store, settle } = setup();
    await settle();
    expect(store.status()).toBe('idle');
    expect(store.hasDocument()).toBe(false);
    expect(open).not.toHaveBeenCalled();
  });

  it('loads the bound source and prefetches page sizes', async () => {
    const { store, settle } = setup();
    open.mockResolvedValue(fakePdf(3, [2]));
    connect(store, () => 'a.pdf');
    expect(store.status()).toBe('loading');

    await settle();
    expect(open).toHaveBeenCalledWith('a.pdf', expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(store.status()).toBe('ready');
    expect(store.pageCount()).toBe(3);
    expect(store.referenceSize()).toEqual({ width: 600, height: 800 });
    expect(store.pageSizes()).toEqual([
      { width: 600, height: 800 },
      { width: 800, height: 600 },
      { width: 600, height: 800 },
    ]);
  });

  it('destroys the previous document and resets the current page when the source changes', async () => {
    const { store, settle } = setup();
    const first = fakePdf(5);
    open.mockResolvedValueOnce(first).mockResolvedValueOnce(fakePdf(2));
    connect(store, () => 'a.pdf');
    await settle();
    store.currentPage.set(4);

    store.source.set('b.pdf');
    await settle();
    expect(first.loadingTask.destroy).toHaveBeenCalled();
    expect(store.pageCount()).toBe(2);
    expect(store.currentPage()).toBe(1);
  });

  it('classifies load errors and can retry', async () => {
    const { store, settle } = setup();
    open.mockRejectedValueOnce(Object.assign(new Error('bad'), { name: 'InvalidPDFException' }));
    connect(store, () => 'bad.pdf');
    await settle();
    expect(store.status()).toBe('error');
    expect(store.loadErrorKind()).toBe('invalid');

    open.mockResolvedValueOnce(fakePdf(1));
    store.reload();
    await settle();
    expect(store.status()).toBe('ready');
    expect(store.loadErrorKind()).toBeNull();
  });

  it('computes the render scale from the zoom and the container', async () => {
    const { store, settle } = setup();
    open.mockResolvedValue(fakePdf(1));
    connect(store, () => 'a.pdf');
    await settle();

    store.containerSize.set({ width: 1232, height: 900 });
    expect(store.scale()).toBeCloseTo(2); // fit-width: (1232 - 2 * 16) / 600
    store.zoom.set(1.5);
    expect(store.scale()).toBeCloseTo(1.5 * PDF_TO_CSS_UNITS);
  });

  describe('navigation', () => {
    it('navigates within bounds, requests a scroll and announces the page', async () => {
      const { store, settle } = setup();
      open.mockResolvedValue(fakePdf(10));
      connect(store, () => 'a.pdf');
      await settle();

      store.goToPage(4);
      expect(store.currentPage()).toBe(4);
      expect(store.scrollRequest()).toEqual({ page: 4, position: 'start' });
      expect(store.announcement()).toBe('Page 4 of 10');

      store.goToPage(99);
      expect(store.currentPage()).toBe(10);
      store.goToPage(-3);
      expect(store.currentPage()).toBe(1);

      store.lastPage();
      expect(store.canGoNext()).toBe(false);
      store.previousPage('end');
      expect(store.scrollRequest()).toEqual({ page: 9, position: 'end' });
    });

    it('requests a new scroll for a repeated navigation, and re-announces it', async () => {
      const { store, settle } = setup();
      open.mockResolvedValue(fakePdf(10));
      connect(store, () => 'a.pdf');
      await settle();

      store.goToPage(3);
      const first = store.scrollRequest();
      const firstAnnouncement = store.announcement();
      store.goToPage(3);
      expect(store.scrollRequest()).not.toBe(first);
      expect(store.announcement()).not.toBe(firstAnnouncement);
      expect(store.announcement().trim()).toBe('Page 3 of 10');
    });

    it('opens a document at a page requested before it was ready', async () => {
      const { store, settle } = setup();
      open.mockResolvedValue(fakePdf(10));
      connect(store, () => 'a.pdf');
      store.goToPage(7);
      await settle();
      expect(store.currentPage()).toBe(7);
      expect(store.scrollRequest()).toEqual({ page: 7, position: 'start' });

      // The pending page is consumed: the next document opens at page 1.
      open.mockResolvedValue(fakePdf(3));
      store.source.set('b.pdf');
      await settle();
      expect(store.currentPage()).toBe(1);
    });

    it('records scrolled pages without scrolling or announcing', async () => {
      const { store, settle } = setup();
      open.mockResolvedValue(fakePdf(10));
      connect(store, () => 'a.pdf');
      await settle();
      store.setVisiblePage(6);
      expect(store.currentPage()).toBe(6);
      expect(store.scrollRequest()).toBeNull();
      expect(store.announcement()).not.toContain('Page 6');
    });

    it('takes the page mode from the input, else from the configuration', () => {
      const { store } = setup();
      let mode: PdfPageMode | undefined;
      connect(store, () => null, () => mode);
      expect(store.pageMode()).toBe('continuous');
      mode = 'single';
      connect(store, () => null, () => mode);
      expect(store.pageMode()).toBe('single');
    });
  });

  describe('zoom', () => {
    async function ready(pages = 3, landscapePages: number[] = []) {
      const context = setup();
      open.mockResolvedValue(fakePdf(pages, landscapePages));
      return context;
    }

    it('follows the zoom input, then the configuration default', async () => {
      const { store, settle } = await ready();
      let zoom: PdfZoom | undefined;
      connect(store, () => 'a.pdf', () => undefined, () => zoom);
      await settle();
      expect(store.zoom()).toBe('fit-width');
      zoom = 1.5;
      connect(store, () => 'a.pdf', () => undefined, () => zoom);
      expect(store.zoom()).toBe(1.5);
      expect(store.effectiveZoom()).toBeCloseTo(1.5);
    });

    it('steps through preset levels from the effective zoom, within bounds', async () => {
      const { store, settle } = await ready();
      connect(store, () => 'a.pdf');
      await settle();
      store.containerSize.set({ width: 1232, height: 900 }); // fit-width: 2 css px/pt = 150%
      expect(store.effectiveZoom()).toBeCloseTo(1.5);

      store.zoomIn();
      expect(store.zoom()).toBe(2);
      expect(store.announcement()).toBe('Zoom: 200%');
      store.zoomOut();
      store.zoomOut();
      expect(store.zoom()).toBe(1.25);

      store.setZoom(4);
      expect(store.canZoomIn()).toBe(false);
      store.setZoom(99);
      expect(store.zoom()).toBe(4);
      store.setZoom(0.1);
      expect(store.canZoomOut()).toBe(false);
    });

    it('announces fit modes by name', async () => {
      const { store, settle } = await ready();
      connect(store, () => 'a.pdf');
      await settle();
      store.setZoom('fit-page');
      expect(store.announcement()).toBe('Zoom: Fit to page');
    });

    it('zooms continuously by a factor, without announcing', async () => {
      const { store, settle } = await ready();
      connect(store, () => 'a.pdf');
      await settle();
      store.setZoom(1);
      store.announce('');
      store.zoomBy(1.1);
      expect(store.zoom()).toBeCloseTo(1.1);
      expect(store.announcement()).toBe('');
      store.zoomBy(100);
      expect(store.zoom()).toBe(4);
    });

    it('fits the first page in continuous mode, the displayed page in single mode', async () => {
      const { store, settle } = await ready(3, [2]);
      let mode: PdfPageMode = 'continuous';
      connect(store, () => 'a.pdf', () => mode);
      await settle();
      store.containerSize.set({ width: 832, height: 2000 });
      store.goToPage(2);
      expect(store.scale()).toBeCloseTo(800 / 600); // first page: 600 pt wide

      mode = 'single';
      connect(store, () => 'a.pdf', () => mode);
      expect(store.scale()).toBeCloseTo(1); // landscape page 2: 800 pt wide
    });
  });

  describe('text content', () => {
    it('fetches the text of each page once per document', async () => {
      const { store, settle } = setup();
      const pdf = fakePdf(3);
      open.mockResolvedValueOnce(pdf);
      connect(store, () => 'a.pdf');
      await settle();

      const [first, again] = await Promise.all([store.getTextContent(2), store.getTextContent(2)]);
      expect(first).toBe(again);
      expect(first.items).toEqual([{ str: 'Text of page 2' }]);
      expect(pdf.getTextContent).toHaveBeenCalledTimes(1);

      const next = fakePdf(3);
      open.mockResolvedValueOnce(next);
      store.source.set('b.pdf');
      await settle();
      await store.getTextContent(2);
      expect(next.getTextContent).toHaveBeenCalledTimes(1);
    });

    it('does not cache failures', async () => {
      const { store, settle } = setup();
      const pdf = fakePdf(1);
      pdf.getTextContent.mockRejectedValueOnce(new Error('worker busy'));
      open.mockResolvedValueOnce(pdf);
      connect(store, () => 'a.pdf');
      await settle();

      await expect(store.getTextContent(1)).rejects.toThrow('worker busy');
      await expect(store.getTextContent(1)).resolves.toMatchObject({ lang: 'en' });
    });

    it('rejects without a document', async () => {
      const { store } = setup();
      await expect(store.getTextContent(1)).rejects.toThrow();
    });
  });

  it('never loads on the server', async () => {
    const { store, settle } = setup('server');
    connect(store, () => 'a.pdf');
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(store.status()).toBe('idle');
  });
});
