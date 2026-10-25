import pg from 'pg';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set. Copy server/.env.example to server/.env.');

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  // Hosted Postgres (Tiger Cloud) requires TLS; local Docker does not.
  ssl: /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL) ? undefined : { rejectUnauthorized: false },
});

// Return DATE columns as 'YYYY-MM-DD' strings, not JS Dates shifted by the server time zone.
pg.types.setTypeParser(pg.types.builtins.DATE, (v) => v);

export async function query<T extends pg.QueryResultRow>(text: string, params: unknown[] = []) {
  const res = await pool.query<T>(text, params);
  return res.rows;
}
