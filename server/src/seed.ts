// Loads the verified bills and daily sets from the app's src/data into Postgres. Safe to rerun.
import { BILLS } from '../../src/data/bills.ts';
import { SEEDED_SETS } from '../../src/data/daily.ts';
import { pool } from './db.ts';

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
  await client.query('COMMIT');
} catch (err) {
  await client.query('ROLLBACK');
  throw err;
} finally {
  client.release();
  await pool.end();
}
