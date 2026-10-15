import { describe, expect, it } from 'vitest';
import type { Role } from '@prisma/client';
import { hasRole } from '@/lib/auth';

const ROLES: Role[] = ['VIEWER', 'ADVISOR', 'ADMIN'];
const GRANTS: Record<Role, Role[]> = {
  VIEWER: ['VIEWER'],
  ADVISOR: ['VIEWER', 'ADVISOR'],
  ADMIN: ['VIEWER', 'ADVISOR', 'ADMIN'],
};

describe('hasRole', () => {
  it('grants exactly the roles at or below the holder', () => {
    for (const held of ROLES) {
      for (const needed of ROLES) {
        expect(hasRole({ role: held }, needed)).toBe(GRANTS[held].includes(needed));
      }
    }
  });

  it('never lets a read-only account through a write gate', () => {
    expect(hasRole({ role: 'VIEWER' }, 'ADVISOR')).toBe(false);
    expect(hasRole({ role: 'VIEWER' }, 'ADMIN')).toBe(false);
    expect(hasRole({ role: 'ADVISOR' }, 'ADMIN')).toBe(false);
  });
});
