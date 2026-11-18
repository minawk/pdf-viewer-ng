import { isPdfFile, resolveFileName } from './file-name';

describe('resolveFileName', () => {
  it('prefers the explicit name, adding the extension', () => {
    expect(resolveFileName('docs/a.pdf', 'Invoice 42')).toBe('Invoice 42.pdf');
    expect(resolveFileName(null, 'report.PDF')).toBe('report.PDF');
  });

  it('uses the name of an opened file', () => {
    expect(resolveFileName(new File([], 'contract.pdf'))).toBe('contract.pdf');
  });

  it('uses the last URL segment, decoded, without query or hash', () => {
    expect(resolveFileName('https://example.com/files/My%20Report.pdf?v=2#page=3')).toBe(
      'My Report.pdf',
    );
    expect(resolveFileName('samples/sample.pdf')).toBe('sample.pdf');
    expect(resolveFileName(new URL('https://example.com/download/42'))).toBe('42.pdf');
  });

  it('falls back to document.pdf', () => {
    expect(resolveFileName(null)).toBe('document.pdf');
    expect(resolveFileName(new Uint8Array())).toBe('document.pdf');
    expect(resolveFileName('https://example.com/')).toBe('document.pdf');
    expect(resolveFileName('data:application/pdf;base64,JVBERi0=')).toBe('document.pdf');
  });

  it('replaces characters file systems reject', () => {
    expect(resolveFileName(null, 'a/b:c*?.pdf')).toBe('a_b_c_.pdf');
  });
});

describe('isPdfFile', () => {
  it('accepts PDFs by type or extension', () => {
    expect(isPdfFile(new File([], 'a.bin', { type: 'application/pdf' }))).toBe(true);
    expect(isPdfFile(new File([], 'scan.PDF'))).toBe(true);
    expect(isPdfFile(new File([], 'photo.png', { type: 'image/png' }))).toBe(false);
  });
});
