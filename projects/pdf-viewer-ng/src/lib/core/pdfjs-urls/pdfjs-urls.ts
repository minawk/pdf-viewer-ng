/** Value of `workerSrc` / `assetsUrl` that loads the pdf.js files from the jsDelivr CDN. */
export const PDFJS_CDN = 'cdn';

/** Root of the pdf.js package on jsDelivr, at the exact version the application installed. */
export function pdfjsCdnRoot(version: string): string {
  return `https://cdn.jsdelivr.net/npm/pdfjs-dist@${version}/`;
}

/** Absolute URL of the pdf.js worker. */
export function resolveWorkerSrc(workerSrc: string, version: string, baseUri: string): string {
  if (workerSrc === PDFJS_CDN) {
    return `${pdfjsCdnRoot(version)}build/pdf.worker.min.mjs`;
  }
  return new URL(workerSrc, baseUri).href;
}

/**
 * Absolute URL (ending with `/`) of the folder holding the pdf.js `cmaps/`, `standard_fonts/`,
 * `wasm/` and `iccs/` folders, or `null` when they are not used. Absolute, because pdf.js fetches
 * them from its worker, whose base URL is the worker script.
 */
export function resolveAssetsRoot(assetsUrl: string | null, version: string, baseUri: string): string | null {
  if (!assetsUrl) {
    return null;
  }
  if (assetsUrl === PDFJS_CDN) {
    return pdfjsCdnRoot(version);
  }
  return new URL(assetsUrl.endsWith('/') ? assetsUrl : `${assetsUrl}/`, baseUri).href;
}
