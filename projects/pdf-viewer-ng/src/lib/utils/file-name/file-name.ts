import { PdfSource } from '../../core/types';

export const DEFAULT_FILE_NAME = 'document.pdf';

/**
 * Name of the downloaded file: the explicit name if any, else the opened file's name,
 * else the last segment of the source URL, else `document.pdf`. Always ends with `.pdf`.
 */
export function resolveFileName(source: PdfSource | null, explicitName?: string | null): string {
  const name = explicitName?.trim() || nameOfSource(source);
  return ensurePdfExtension(sanitize(name) || DEFAULT_FILE_NAME);
}

function nameOfSource(source: PdfSource | null): string {
  if (typeof File !== 'undefined' && source instanceof File) {
    return source.name;
  }
  if (typeof source === 'string' || source instanceof URL) {
    try {
      const url = new URL(source.toString(), 'http://localhost/');
      if (url.protocol === 'data:' || url.protocol === 'blob:') {
        return '';
      }
      const segment = url.pathname.split('/').filter(Boolean).pop() ?? '';
      return decodeURIComponent(segment);
    } catch {
      return '';
    }
  }
  return '';
}

/** Removes characters that file systems reject. */
function sanitize(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '_').trim();
}

function ensurePdfExtension(name: string): string {
  return /\.pdf$/i.test(name) ? name : `${name}.pdf`;
}

/** Whether a dropped or picked file is a PDF, by MIME type or extension. */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
}
