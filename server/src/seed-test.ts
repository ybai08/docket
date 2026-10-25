// Fills one account with sample history so every screen has something to show: two weeks of
// results, votes on the past sets, onboarding answers and vote sharing. Today's ballot is left
// unplayed. Run seed:demo afterwards for the demo friends and group.
// Usage: npm run seed:test -- <firebase uid>     (or --latest for the newest non-demo account)
import { SEEDED_SETS } from '../../src/data/daily.ts';
import { addDays, centralDay } from '../../src/lib/day.ts';
import { agreed, filedOrFakeScore, landslideAnswer, landslidePoints } from '../../src/lib/rules.ts';
import { pool, query } from './db.ts';
import { lookupZip } from './geo.ts';

const arg = process.argv[2];
if (!arg) throw new Error('Usage: npm run seed:test -- <uid> | --latest');
const [user] =
  arg === '--latest'
    ? await query<{ id: string; display_name: string | null }>(
        'SELECT id, display_name FROM users WHERE NOT is_demo ORDER BY created_at DESC LIMIT 1',
      )
    : await query<{ id: string; display_name: string | null }>('SELECT id, display_name FROM users WHERE id = $1', [arg]);
if (!user) throw new Error('No such account. Sign in with it in the app first, so its row exists.');
const uid = user.id;

// Onboarding answers, as if the person had gone through it.
const loc = await lookupZip('78705');
await query(
  `UPDATE users SET display_name = COALESCE(display_name, 'Test Player'), zip = '78705', state = $2, county = $3, city = $4,
     districts = $5, issues = $6, onboarded = true, share_votes = true
   WHERE id = $1`,
  [uid, loc?.state ?? 'TX', loc?.county ?? 'Travis County', loc?.city ?? 'Austin', JSON.stringify(loc?.districts ?? {}),
    ['Public schools', 'Housing and property tax', 'Tech and privacy']],
);

const today = centralDay();
// Votes and full results on every seeded set before today. Pattern: mostly Yea, a couple of Nays.
const pattern: ('yea' | 'nay')[] = ['yea', 'nay', 'yea', 'yea', 'nay', 'yea', 'yea', 'yea', 'nay', 'yea'];
let n = 0;
for (const [day, set] of Object.entries(SEEDED_SETS)) {
  if (day >= today) continue;
  const votes = set.rollCall.map((b) => [b, pattern[n++ % pattern.length]] as const);
  for (const [b, vote] of votes) {
    await query(
      `INSERT INTO votes (user_id, bill_id, day, vote) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, bill_id) DO UPDATE SET vote = EXCLUDED.vote, day = EXCLUDED.day`,
      [uid, b.id, day, vote],
    );
  }
  const rollCall = votes.filter(([b, v]) => agreed(b, v)).length;
  // Filed or Fake: everything right but the second caption. Landslide: top two swapped.
  const answers = Object.fromEntries(set.filedOrFake.map((c, i) => [c.id, i === 1 ? !c.real : c.real]));
  const answer = landslideAnswer(set.landslide.items);
  const order = answer.length ? [answer[1], answer[0], ...answer.slice(2)] : [];
  await result(day, 'roll-call', rollCall, {});
  await result(day, 'filed-or-fake', set.filedOrFake.length ? filedOrFakeScore(set.filedOrFake, answers) : 6, { answers });
  await result(day, 'landslide', order.length ? landslidePoints(order, answer).reduce((a, b) => a + b, 0) : 8, { order });
}

// Older days with scores only (no ballots exist for them), so streaks and the week strip fill in.
// Missing the day 4 days ago splits history into two runs: current streak 3, max streak 10.
for (let back = 2; back <= 14; back++) {
  const day = addDays(today, -back);
  if (SEEDED_SETS[day] || back === 4) continue;
  await result(day, 'roll-call', 3 + (back % 3), {});
  await result(day, 'filed-or-fake', 5 + (back % 4), {});
  if (back % 5 !== 0) await result(day, 'landslide', 4 + ((back * 3) % 9), {});
}

console.log(`seeded test history for ${user.display_name ?? uid}; today (${today}) is left unplayed`);
await pool.end();

async function result(day: string, game: string, score: number, detail: object) {
  await query(
    `INSERT INTO game_results (user_id, day, game, score, detail, finished_at)
     VALUES ($1, $2, $3, $4, $5, ($2::date + time '20:00') AT TIME ZONE 'America/Chicago')
     ON CONFLICT (user_id, day, game) DO UPDATE SET score = EXCLUDED.score, detail = EXCLUDED.detail, finished_at = EXCLUDED.finished_at`,
    [uid, day, game, score, JSON.stringify(detail)],
  );
}
