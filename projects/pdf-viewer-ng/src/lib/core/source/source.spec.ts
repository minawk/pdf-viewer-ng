import { toDocumentParams } from './source';

describe('toDocumentParams', () => {
  it('passes URLs through', async () => {
    expect(await toDocumentParams('docs/a.pdf')).toEqual({ url: 'docs/a.pdf' });
    expect(await toDocumentParams(new URL('https://example.com/a.pdf'))).toEqual({
      url: 'https://example.com/a.pdf',
    });
  });

  it('copies binary data so the caller keeps a usable buffer', async () => {
    const bytes = new Uint8Array([37, 80, 68, 70]);
    const params = (await toDocumentParams(bytes)) as { data: Uint8Array };
    expect(params.data).toEqual(bytes);
    expect(params.data.buffer).not.toBe(bytes.buffer);

    const fromBuffer = (await toDocumentParams(bytes.buffer)) as { data: Uint8Array };
    expect(fromBuffer.data.buffer).not.toBe(bytes.buffer);
  });

  it('reads blobs and files', async () => {
    const params = (await toDocumentParams(new Blob([new Uint8Array([1, 2, 3])]))) as {
      data: Uint8Array;
    };
    expect(Array.from(params.data)).toEqual([1, 2, 3]);
  });
});
