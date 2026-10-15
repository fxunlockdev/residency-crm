/**
 * Runs once when the server boots, before any request is served.
 *
 * Config only: a missing AUTH_SECRET otherwise produces a green healthcheck and
 * an app nobody can sign in to, because verifySessionToken catches the thrown
 * error alongside genuine JWT failures. Filesystem checks live in the container
 * entrypoint, which runs before Node starts.
 */
export async function register(): Promise<void> {
  const { assertEnvironment } = await import('./lib/env');
  assertEnvironment();
}
