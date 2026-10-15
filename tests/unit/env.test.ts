import { describe, expect, it } from 'vitest';
import { assertEnvironment, checkEnvironment } from '@/lib/env';

const ok = {
  DATABASE_URL: 'postgresql://user:pass@host:5432/db',
  AUTH_SECRET: 'x'.repeat(48),
  UPLOAD_DIR: '/data/uploads',
  NODE_ENV: 'production',
} as NodeJS.ProcessEnv;

describe('checkEnvironment', () => {
  it('passes a complete production configuration', () => {
    expect(checkEnvironment(ok)).toEqual([]);
  });

  it('catches the mistakes that would ship a silently unusable app', () => {
    expect(checkEnvironment({ ...ok, AUTH_SECRET: undefined }).map((p) => p.key)).toEqual(['AUTH_SECRET']);
    expect(checkEnvironment({ ...ok, AUTH_SECRET: 'too-short' }).map((p) => p.key)).toEqual(['AUTH_SECRET']);
    expect(checkEnvironment({ ...ok, DATABASE_URL: '' }).map((p) => p.key)).toEqual(['DATABASE_URL']);
    expect(checkEnvironment({ ...ok, UPLOAD_DIR: '' }).map((p) => p.key)).toEqual(['UPLOAD_DIR']);
  });

  it('only requires an upload directory in production', () => {
    expect(checkEnvironment({ ...ok, UPLOAD_DIR: '', NODE_ENV: 'development' })).toEqual([]);
  });

  it('reports every problem at once rather than one per restart', () => {
    expect(checkEnvironment({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toHaveLength(3);
  });

  it('throws with every problem named', () => {
    expect(() => assertEnvironment({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/AUTH_SECRET/);
    expect(() => assertEnvironment(ok)).not.toThrow();
  });
});
