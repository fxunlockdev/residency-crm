import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { middleware } from '@/middleware';

/**
 * The integration tests call route handlers directly, so they cannot see the
 * middleware. That gap already let a signed-out 401 sit in front of a working
 * endpoint once: the updates signup was rejected before its own token check
 * ever ran. These assert the front door, not the room behind it.
 */
function visit(path: string) {
  return middleware(new NextRequest(`https://crm.test${path}`, { method: 'POST' }));
}

describe('middleware public paths', () => {
  const reachable = [
    // Both are posted to by the marketing site and authenticate themselves
    // with LEAD_INTAKE_TOKEN.
    '/api/leads/intake',
    '/api/updates/subscribe',
    '/api/updates/unsubscribe',
    // Published articles, read by the website. Same token check.
    '/api/public/articles',
    '/api/public/articles/some-slug',
    '/api/health',
    // Authenticates with CRON_SECRET.
    '/api/cron/digest',
    '/login',
  ];

  for (const path of reachable) {
    it(`lets a signed-out request reach ${path}`, async () => {
      const response = await visit(path);
      expect(response.status).not.toBe(401);
      expect(response.headers.get('location')).toBeNull();
    });
  }

  const guarded = [
    '/api/clients',
    '/api/admin/users',
    '/api/updates-not-a-real-prefix',
    // A prefix match on '/api/public' must not open '/api/publicanything'.
    '/api/publicity',
  ];

  for (const path of guarded) {
    it(`still refuses a signed-out request to ${path}`, async () => {
      const response = await visit(path);
      expect(response.status).toBe(401);
    });
  }

  it('sends a signed-out visitor to the login page rather than a bare 401', async () => {
    const response = await middleware(new NextRequest('https://crm.test/clients', { method: 'GET' }));
    expect(response.headers.get('location')).toContain('/login');
  });
});
