import { resolveAssetsRoot, resolveWorkerSrc } from './pdfjs-urls';

const base = 'https://app.example.com/viewer/';

describe('resolveWorkerSrc', () => {
  it('resolves a local path against the document base URL', () => {
    expect(resolveWorkerSrc('assets/pdfjs/pdf.worker.min.mjs', '6.5.438', base)).toBe(
      'https://app.example.com/viewer/assets/pdfjs/pdf.worker.min.mjs',
    );
  });

  it("loads the worker of the installed pdf.js version from the CDN with 'cdn'", () => {
    expect(resolveWorkerSrc('cdn', '6.5.438', base)).toBe(
      'https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/build/pdf.worker.min.mjs',
    );
  });
});

describe('resolveAssetsRoot', () => {
  it('is null when the optional files are not used', () => {
    expect(resolveAssetsRoot(null, '6.5.438', base)).toBeNull();
  });

  it('resolves a local folder, with a trailing slash', () => {
    expect(resolveAssetsRoot('assets/pdfjs', '6.5.438', base)).toBe('https://app.example.com/viewer/assets/pdfjs/');
  });

  it("uses the CDN package root with 'cdn'", () => {
    expect(resolveAssetsRoot('cdn', '6.5.438', base)).toBe('https://cdn.jsdelivr.net/npm/pdfjs-dist@6.5.438/');
  });
});
