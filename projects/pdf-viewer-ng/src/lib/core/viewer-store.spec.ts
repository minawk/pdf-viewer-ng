import { ApplicationRef, PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PDF_TO_CSS_UNITS } from '../utils/zoom';
import { OpenDocumentOptions, PdfEngine } from './pdf-engine';
import { PdfSource } from './types';
import { ViewerStore } from './viewer-store';

function fakePdf(numPages: number, landscapePages: number[] = []) {
  return {
    numPages,
    getPage: (pageNumber: number) =>
      Promise.resolve({
        getViewport: ({ scale }: { scale: number }) =>
          landscapePages.includes(pageNumber)
            ? { width: 800 * scale, height: 600 * scale }
            : { width: 600 * scale, height: 800 * scale },
      }),
    loadingTask: { destroy: vi.fn(() => Promise.resolve()) },
  };
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
    store.bindSource(() => 'a.pdf');
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
    store.bindSource(() => 'a.pdf');
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
    store.bindSource(() => 'bad.pdf');
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
    store.bindSource(() => 'a.pdf');
    await settle();

    store.containerSize.set({ width: 1232, height: 900 });
    expect(store.scale()).toBeCloseTo(2); // fit-width: (1232 - 2 * 16) / 600
    store.zoom.set(1.5);
    expect(store.scale()).toBeCloseTo(1.5 * PDF_TO_CSS_UNITS);
  });

  it('never loads on the server', async () => {
    const { store, settle } = setup('server');
    store.bindSource(() => 'a.pdf');
    await settle();
    expect(open).not.toHaveBeenCalled();
    expect(store.status()).toBe('idle');
  });
});
