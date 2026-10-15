/**
 * Only a single-slash relative path is a safe post-login destination.
 * "//evil.example" and "/\evil" are protocol-relative: they pass a naive
 * startsWith('/') check and send a freshly authenticated user off-site.
 */
export function safeRedirectTarget(next: string | null | undefined): string {
  if (typeof next !== 'string') return '/';
  const trimmed = next.trim();
  if (!trimmed.startsWith('/')) return '/';
  if (trimmed.startsWith('//') || trimmed.startsWith('/\\')) return '/';
  if (/[\u0000-\u001F\u007F]/.test(trimmed)) return '/';
  return trimmed;
}
