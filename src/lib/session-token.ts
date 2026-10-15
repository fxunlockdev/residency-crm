import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@prisma/client';

export const SESSION_COOKIE = 'rf_session';
const SESSION_HOURS = 12;

export type SessionPayload = {
  sub: string;
  email: string;
  name: string;
  role: Role;
};

/** A verified token, with the issue time needed to honour password resets. */
export type VerifiedSession = SessionPayload & { issuedAt: Date | null };

function secretKey(): Uint8Array {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('AUTH_SECRET is missing or shorter than 32 characters.');
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ email: payload.email, name: payload.name, role: payload.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_HOURS}h`)
    .sign(secretKey());
}

export async function verifySessionToken(token: string | undefined): Promise<VerifiedSession | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ['HS256'] });
    if (!payload.sub || typeof payload.email !== 'string' || typeof payload.role !== 'string') return null;
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : payload.email,
      role: payload.role as Role,
      issuedAt: typeof payload.iat === 'number' ? new Date(payload.iat * 1000) : null,
    };
  } catch {
    return null;
  }
}

/**
 * True when the token predates the account's last password change.
 *
 * `iat` has one-second resolution, so a token issued in the same second as the
 * change is allowed through — that is the sign-in that set the password.
 */
export function isSupersededByPasswordChange(
  issuedAt: Date | null,
  passwordChangedAt: Date | null | undefined,
): boolean {
  if (!passwordChangedAt) return false;
  if (!issuedAt) return true; // No issue time: cannot prove it is current.
  return passwordChangedAt.getTime() - issuedAt.getTime() > 1000;
}

export const SESSION_MAX_AGE_SECONDS = SESSION_HOURS * 60 * 60;
