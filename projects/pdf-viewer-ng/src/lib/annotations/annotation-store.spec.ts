import { ApplicationRef, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { PdfEngine } from '../core/pdf-engine';
import { ViewerStore } from '../core/viewer-store';
import { AnnotationStore } from './annotation-store';
import { PdfAnnotation } from './model';

function fakePdf() {
  const entries = new Map<string, unknown>();
  return {
    numPages: 2,
    entries,
    getPage: () => Promise.resolve({ getViewport: () => ({ width: 612, height: 792 }) }),
    loadingTask: { destroy: () => Promise.resolve() },
    annotationStorage: {
      setValue: (key: string, value: unknown) => entries.set(key, value),
      remove: (key: string) => entries.delete(key),
      get size() {
        return entries.size;
      },
    },
  };
}

const highlight: PdfAnnotation = {
  id: 'h1',
  type: 'highlight',
  page: 1,
  color: '#ffff98',
  text: 'Hello',
  rects: [[10, 10, 50, 22]],
};

describe('AnnotationStore', () => {
  async function setup(initial?: readonly PdfAnnotation[]) {
    const open = vi.fn();
    TestBed.configureTestingModule({
      providers: [ViewerStore, AnnotationStore, { provide: PdfEngine, useValue: { open } }],
    });
    const viewer = TestBed.inject(ViewerStore);
    const store = TestBed.inject(AnnotationStore);
    const input = signal<readonly PdfAnnotation[] | undefined>(initial);
    store.connect(input);
    const first = fakePdf();
    open.mockResolvedValueOnce(first);
    viewer.connect({ src: () => 'a.pdf', pageMode: () => undefined, zoom: () => undefined });
    const settle = () => TestBed.inject(ApplicationRef).whenStable();
    await settle();
    return { viewer, store, input, first, open, settle };
  }

  it('keeps the annotations given as input once the document is loaded', async () => {
    const { store } = await setup([highlight]);
    expect(store.annotations()).toEqual([highlight]);
  });

  it('mirrors annotations into the pdf.js storage, under keys the pdf.js worker saves', async () => {
    const { store, first, settle } = await setup();
    store.add(highlight);
    await settle();
    const [key] = [...first.entries.keys()];
    // The pdf.js worker only writes entries with this prefix into the file.
    expect(key.startsWith('pdfjs_internal_editor_')).toBe(true);
    expect(first.entries.get(key)).toMatchObject({ annotationType: 9, pageIndex: 0 });

    store.remove('h1');
    await settle();
    expect(first.annotationStorage.size).toBe(0);
  });

  it('does not save notes without text', async () => {
    const { store, first, settle } = await setup();
    store.add({ id: 't1', type: 'text', page: 1, color: '#000000', text: '  ', fontSize: 12, rect: [0, 0, 10, 10] });
    await settle();
    expect(first.annotationStorage.size).toBe(0);
    store.update('t1', { text: 'Done' });
    await settle();
    expect(first.annotationStorage.size).toBe(1);
  });

  it('starts a replacing document without annotations, unless new ones are given', async () => {
    const { viewer, store, input, open, settle } = await setup([highlight]);
    open.mockResolvedValueOnce(fakePdf());
    viewer.source.set('b.pdf');
    await settle();
    expect(store.annotations()).toEqual([]);

    const other: PdfAnnotation = { ...highlight, id: 'h2' };
    open.mockResolvedValueOnce(fakePdf());
    viewer.source.set('c.pdf');
    input.set([other]);
    await settle();
    expect(store.annotations()).toEqual([other]);
  });

  it('updates and removes annotations by id', async () => {
    const { store } = await setup([highlight]);
    store.update('h1', { color: '#53ffbc' });
    expect(store.annotations()[0].color).toBe('#53ffbc');
    store.selectedId.set('h1');
    store.remove('h1');
    expect(store.annotations()).toEqual([]);
    expect(store.selectedId()).toBeNull();
  });
});
