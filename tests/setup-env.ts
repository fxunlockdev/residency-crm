/** Loads .env for integration tests, which talk to a real database. */
import { readFileSync } from 'node:fs';
import path from 'node:path';

try {
  const raw = readFileSync(path.resolve(process.cwd(), '.env'), 'utf8');
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (process.env[key!]) continue;
    process.env[key!] = rawValue!.replace(/^["']|["']$/g, '');
  }
} catch {
  // No .env: integration tests will skip themselves.
}
