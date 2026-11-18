import { classifyLoadError } from './errors';

describe('classifyLoadError', () => {
  it('recognizes pdf.js exceptions by name, also when wrapped', () => {
    expect(classifyLoadError({ name: 'InvalidPDFException' })).toBe('invalid');
    expect(classifyLoadError({ name: 'ResponseException' })).toBe('missing');
    expect(classifyLoadError({ name: 'PasswordException' })).toBe('password');
    expect(classifyLoadError(new Error('wrapped', { cause: { name: 'PasswordException' } }))).toBe('password');
    expect(classifyLoadError(new TypeError('Failed to fetch'))).toBe('unknown');
    expect(classifyLoadError(null)).toBe('unknown');
  });
});
