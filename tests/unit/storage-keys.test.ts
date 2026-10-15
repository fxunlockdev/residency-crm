import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { formatBytes, MAX_UPLOAD_BYTES, resolveKey, UploadError } from '@/lib/storage';

const ROOT = '/tmp/rf-test-uploads';

describe('resolveKey', () => {
  it('resolves a generated key inside the upload root', () => {
    process.env.UPLOAD_DIR = ROOT;
    const resolved = resolveKey('2026/2f1c0e1a-0000-4000-8000-000000000000.pdf');
    expect(resolved).toBe(path.join(ROOT, '2026/2f1c0e1a-0000-4000-8000-000000000000.pdf'));
  });

  it.each(['../../../etc/passwd', '/etc/passwd', '..', '2026/../../outside.pdf', './../../etc/shadow'])(
    'refuses to escape the upload root: %s',
    (key) => {
      process.env.UPLOAD_DIR = ROOT;
      expect(() => resolveKey(key)).toThrow(UploadError);
    },
  );

  it('keeps the upload ceiling where the spec puts it', () => {
    expect(MAX_UPLOAD_BYTES).toBe(10 * 1024 * 1024);
  });
});

describe('formatBytes', () => {
  it('reads naturally at each scale', () => {
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(2048)).toBe('2 KB');
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB');
  });
});
