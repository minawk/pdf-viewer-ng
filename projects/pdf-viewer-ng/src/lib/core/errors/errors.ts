/** Why a document could not be opened. */
export type PdfLoadErrorKind = 'invalid' | 'missing' | 'password' | 'unknown';

/** Maps pdf.js exceptions (matched by name, as pdf.js is loaded lazily) to an error kind. */
export function classifyLoadError(error: unknown): PdfLoadErrorKind {
  const kind = kindFromName(errorName(error));
  if (kind !== 'unknown') {
    return kind;
  }
  // Wrapped errors (e.g. by Angular resources) keep the original one as `cause`.
  const cause = (error as { cause?: unknown } | null)?.cause;
  return cause === undefined ? kind : kindFromName(errorName(cause));
}

function kindFromName(name: string | undefined): PdfLoadErrorKind {
  switch (name) {
    case 'InvalidPDFException':
      return 'invalid';
    case 'ResponseException':
    case 'MissingPDFException':
    case 'UnexpectedResponseException':
      return 'missing';
    case 'PasswordException':
      return 'password';
    default:
      return 'unknown';
  }
}

function errorName(error: unknown): string | undefined {
  if (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    typeof error.name === 'string'
  ) {
    return error.name;
  }
  return undefined;
}
