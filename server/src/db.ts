import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env.');

const url = new URL(process.env.DATABASE_URL);
const local = /^(localhost|127\.0\.0\.1)$/.test(url.hostname);
// sslmode in the URL would override the ssl options below, so TLS is configured here instead.
url.searchParams.delete('sslmode');

// Tiger Cloud (Timescale) signs with its own CA, so trust exactly that CA and keep full verification.
const TIMESCALE_CA = join(import.meta.dirname, '..', 'certs', 'timescale-ca.pem');

export const pool = new pg.Pool({
  connectionString: url.toString(),
  ssl: local
    ? undefined
    : url.hostname.endsWith('.tsdb.cloud.timescale.com')
      ? { ca: readFileSync(TIMESCALE_CA, 'utf8') }
      : { rejectUnauthorized: true },
});

// Return DATE columns as 'YYYY-MM-DD' strings, not JS Dates shifted by the server time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export async function query<T extends pg.QueryResultRow>(text: string, params: unknown[] = []) {
  const res = await pool.query<T>(text, params);
  return res.rows;
}
