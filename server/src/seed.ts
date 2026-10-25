// Loads the verified bills and daily sets from the app's src/data, and the civic data built by
// scripts/build_civic_data.py (lawmakers, their votes, ZIP districts), into Postgres. Safe to rerun.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { BILLS } from '../../src/data/bills.ts';
import { SEEDED_SETS } from '../../src/data/daily.ts';
import { pool } from './db.ts';

const civic = <T,>(file: string): T[] => {
  const raw = readFileSync(join(import.meta.dirname, '..', 'data', file));
  return JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8'));
};
type Lawmaker = {
  id: string; body: string; state: string; city: string | null; name: string; title: string; party: string | null;
  district: string | null; district_key: string | null; photo_url: string | null; photo_source: string | null;
  photo_credit: string | null; source_url: string;
};
type MemberVote = { lawmaker_id: string; bill_id: string; vote: string; source_url: string };
type ZipDistrict = { zip: string; state: string; kind: string; code: string; name: string; share: number };

const client = await pool.connect();
try {
  await client.query('BEGIN');
  for (const b of Object.values(BILLS)) {
    await client.query(
      `INSERT INTO bills (id, level, jurisdiction, number, origin, title, short_title, summary, topic, chamber_votes, passed, outcome, source_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
       ON CONFLICT (id) DO UPDATE SET level = $2, jurisdiction = $3, number = $4, origin = $5, title = $6, short_title = $7,
         summary = $8, topic = $9, chamber_votes = $10, passed = $11, outcome = $12, source_url = $13`,
      [b.id, b.level, b.jurisdiction, b.number, b.origin, b.title, b.shortTitle, b.summary, b.topic,
        JSON.stringify(b.chamberVotes), b.passed, b.outcome, b.sourceUrl],
    );
  }
  for (const [day, set] of Object.entries(SEEDED_SETS)) {
    await client.query('DELETE FROM daily_sets WHERE day = $1', [day]);
    const rows: [string, number, string | null, unknown][] = [
      ...set.rollCall.map((b, i) => ['roll-call', i, b.id, null] as [string, number, string, null]),
      ...set.filedOrFake.map((c, i) => ['filed-or-fake', i, null, c] as [string, number, null, unknown]),
      ...set.landslide.items.map((it, i) => ['landslide', i, null, { ...it, prompt: set.landslide.prompt }] as [string, number, null, unknown]),
    ];
    for (const [game, position, billId, payload] of rows) {
      await client.query('INSERT INTO daily_sets (day, game, position, bill_id, payload) VALUES ($1,$2,$3,$4,$5)', [
        day, game, position, billId, payload === null ? null : JSON.stringify(payload),
      ]);
    }
    console.log(`seeded ${day}: ${rows.length} items`);
  }

  // Civic data is replaced wholesale: rosters change, and a lawmaker who left office should disappear.
  const lawmakers = civic<Lawmaker>('lawmakers.json.gz');
  const memberVotes = civic<MemberVote>('lawmaker-votes.json');
  const zips = civic<ZipDistrict>('zip-districts.json.gz');
  await client.query('DELETE FROM lawmaker_votes');
  await client.query('DELETE FROM lawmakers');
  await client.query('DELETE FROM zip_districts');
  const col = <T, K extends keyof T>(rows: T[], k: K) => rows.map((r) => r[k]);
  await client.query(
    `INSERT INTO lawmakers (id, body, state, city, name, title, party, district, district_key, photo_url, photo_source, photo_credit, source_url)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[],
                          $10::text[], $11::text[], $12::text[], $13::text[])`,
    ([
      'id', 'body', 'state', 'city', 'name', 'title', 'party', 'district', 'district_key', 'photo_url', 'photo_source', 'photo_credit', 'source_url',
    ] as const).map((k) => col(lawmakers, k)),
  );
  await client.query(
    `INSERT INTO lawmaker_votes (lawmaker_id, bill_id, vote, source_url)
     SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[])`,
    (['lawmaker_id', 'bill_id', 'vote', 'source_url'] as const).map((k) => col(memberVotes, k)),
  );
  // About 200k rows nationally; insert in chunks to keep each statement's parameters small.
  for (let i = 0; i < zips.length; i += 25000) {
    const chunk = zips.slice(i, i + 25000);
    await client.query(
      `INSERT INTO zip_districts (zip, state, kind, code, name, share)
       SELECT * FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::real[])`,
      (['zip', 'state', 'kind', 'code', 'name', 'share'] as const).map((k) => col(chunk, k)),
    );
  }
  console.log(`seeded ${lawmakers.length} lawmakers, ${memberVotes.length} member votes, ${zips.length} ZIP district rows`);

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
