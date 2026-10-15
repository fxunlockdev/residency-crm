/**
 * Startup configuration check.
 *
 * Without this, a missing AUTH_SECRET produces a green healthcheck and an app
 * nobody can sign in to: verifySessionToken catches the thrown error alongside
 * genuine JWT failures, so every request simply looks logged out.
 */
export type EnvProblem = { key: string; message: string };

export function checkEnvironment(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const problems: EnvProblem[] = [];

  if (!env.DATABASE_URL?.trim()) {
    problems.push({ key: 'DATABASE_URL', message: 'is not set.' });
  }

  const secret = env.AUTH_SECRET?.trim() ?? '';
  if (!secret) {
    problems.push({ key: 'AUTH_SECRET', message: 'is not set. Generate one with: openssl rand -base64 48' });
  } else if (secret.length < 32) {
    problems.push({ key: 'AUTH_SECRET', message: `is only ${secret.length} characters; at least 32 are required.` });
  }

  if (env.NODE_ENV === 'production' && !env.UPLOAD_DIR?.trim()) {
    problems.push({
      key: 'UPLOAD_DIR',
      message: 'is not set, so uploads would be written to the container filesystem and lost on redeploy.',
    });
  }

  return problems;
}

export function assertEnvironment(env: NodeJS.ProcessEnv = process.env): void {
  const problems = checkEnvironment(env);
  if (problems.length === 0) return;
  const detail = problems.map((p) => `  ${p.key} ${p.message}`).join('\n');
  throw new Error(`Configuration is incomplete:\n${detail}`);
}
