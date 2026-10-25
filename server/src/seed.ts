// Loads the verified bills and daily sets from the app's src/data, and the civic data built by
// scripts/build_civic_data.py (lawmakers, their votes, ZIP districts), into Postgres. Safe to rerun.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

import { BILLS } from '../../src/data/bills.ts';
import { SEEDED_SETS } from '../../src/data/daily.ts';
import type { Bill, Caption, LandslideItem } from '../../src/data/types.ts';
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
type Profile = { lawmaker_id: string; in_office_since: string | null; background: unknown; committees: unknown; links: unknown[] };
type Row = [game: string, scope: string, position: number, billId: string | null, payload: unknown];
type StateContent = {
  day: string;
  bills: Bill[];
  sets: Record<string, { rollCall: string[]; filedOrFake: Caption[]; landslide: { prompt: string; items: LandslideItem[] } }>;
  memberVotes: MemberVote[];
};

/** '' for Congress, 'TX' for a state bill, 'TX/Austin' for a city's ("Austin, TX"). */
function scopeOf(b: Bill) {
  if (b.level === 'federal') return '';
  if (b.level === 'state') return b.jurisdiction;
  const [city, state] = b.jurisdiction.split(', ');
  return `${state}/${city}`;
}

type MemberVote = { lawmaker_id: string; bill_id: string; vote: string; source_url: string };
type ZipDistrict = { zip: string; state: string; kind: string; code: string; name: string; share: number };

const client = await pool.connect();
try {
  await client.query('BEGIN');
  // Every state's own bills and daily set, from scripts/fetch_state_bills.py and the plain-English text in
  // data/state-content.json.gz. Texas, Austin and Congress come from src/data.
  const content = existsSync(join(import.meta.dirname, '..', 'data', 'state-content.json.gz'))
    ? (civic<StateContent>('state-content.json.gz') as unknown as StateContent)
    : null;
  for (const b of [...Object.values(BILLS), ...(content?.bills ?? [])]) {
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
    // Roll Call bills go to their own place: Congress to everyone, Texas bills to Texans, Austin's to Austin.
    // Filed or Fake and Landslide are Texas sets, and stay the default where a state has none of its own.
    const rows: Row[] = [
      ...set.rollCall.map((b, i): Row => ['roll-call', scopeOf(b), i, b.id, null]),
      ...set.filedOrFake.map((c, i): Row => ['filed-or-fake', '', i, null, c]),
      ...set.landslide.items.map((it, i): Row => ['landslide', '', i, null, { ...it, prompt: set.landslide.prompt }]),
    ];
    if (content && day === content.day) {
      for (const [state, st] of Object.entries(content.sets)) {
        // Interleaved with Congress's two bills (positions 1 and 3).
        st.rollCall.forEach((id, i) => rows.push(['roll-call', state, i * 2, id, null]));
        st.filedOrFake.forEach((c, i) => rows.push(['filed-or-fake', state, i, null, c]));
        st.landslide.items.forEach((it, i) => rows.push(['landslide', state, i, null, { ...it, prompt: st.landslide.prompt }]));
      }
    }
    for (const [game, scope, position, billId, payload] of rows) {
      await client.query('INSERT INTO daily_sets (day, scope, game, position, bill_id, payload) VALUES ($1,$2,$3,$4,$5,$6)', [
        day, scope, game, position, billId, payload === null ? null : JSON.stringify(payload),
      ]);
    }
    console.log(`seeded ${day}: ${rows.length} items`);
  }

  // Civic data is replaced wholesale: rosters change, and a lawmaker who left office should disappear.
  const lawmakers = civic<Lawmaker>('lawmakers.json.gz');
  const ids = new Set(lawmakers.map((l) => l.id));
  // State member votes only for people still in office, like the Texas journal votes.
  const memberVotes = [...civic<MemberVote>('lawmaker-votes.json'), ...(content?.memberVotes ?? []).filter((v) => ids.has(v.lawmaker_id))];
  const zips = civic<ZipDistrict>('zip-districts.json.gz');
  const profiles = civic<Profile>('lawmaker-profiles.json.gz');
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
  const json = (v: unknown) => (v == null ? null : JSON.stringify(v));
  await client.query(
    `INSERT INTO lawmaker_profiles (lawmaker_id, in_office_since, background, committees, links)
     SELECT * FROM unnest($1::text[], $2::text[], $3::jsonb[], $4::jsonb[], $5::jsonb[])`,
    [col(profiles, 'lawmaker_id'), col(profiles, 'in_office_since'), profiles.map((p) => json(p.background)),
      profiles.map((p) => json(p.committees)), profiles.map((p) => JSON.stringify(p.links))],
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
  console.log(`seeded ${lawmakers.length} lawmakers, ${profiles.length} profiles, ${memberVotes.length} member votes, ${zips.length} ZIP district rows`);

  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
