// Demo accounts so the leaderboard, friends and group splits look alive in the demo video.
// Every one is flagged is_demo and shown with a "Demo" tag in the app. Their votes and scores
// are sample data; the bills they vote on are real. Usage: npm run seed:demo [-- <your uid>]
// Without a uid, every real (non-demo) account is befriended.
import { SEEDED_SETS } from '../../src/data/daily.ts';
import { filedOrFakeScore, landslideAnswer, landslidePoints } from '../../src/lib/rules.ts';
import { pool, query } from './db.ts';

type Demo = {
  id: string;
  name: string;
  city: string;
  share: boolean;
  /** Probability of voting Yea on each bill, in Roll Call order per day. */
  lean: number[];
  /** Filed or Fake answers right out of 8, and Landslide order quality. */
  fofRight: number;
  landslideExact: boolean;
};

const DEMOS: Demo[] = [
  { id: 'demo-priya', name: 'Priya', city: 'Austin', share: true, lean: [1, 1, 0, 1, 1], fofRight: 8, landslideExact: true },
  { id: 'demo-jordan', name: 'Jordan', city: 'Austin', share: false, lean: [1, 0, 1, 1, 0], fofRight: 6, landslideExact: false },
  { id: 'demo-sam', name: 'Sam', city: 'Austin', share: false, lean: [0, 1, 1, 0, 1], fofRight: 5, landslideExact: false },
  { id: 'demo-marcus', name: 'Marcus', city: 'Houston', share: false, lean: [0, 0, 1, 0, 0], fofRight: 4, landslideExact: false },
  { id: 'demo-taylor', name: 'Taylor', city: 'Austin', share: false, lean: [1, 1, 1, 0, 1], fofRight: 7, landslideExact: true },
  { id: 'demo-devin', name: 'Devin', city: 'Dallas', share: false, lean: [1, 0, 0, 1, 1], fofRight: 3, landslideExact: false },
];

const target = process.argv[2];

for (const d of DEMOS) {
  await query(
    `INSERT INTO users (id, display_name, username, city, state, share_votes, onboarded, is_demo)
     VALUES ($1, $2, $3, $4, 'TX', $5, true, true)
     ON CONFLICT (id) DO UPDATE SET display_name = $2, city = $4, share_votes = $5, is_demo = true`,
    [d.id, d.name, `${d.name.toLowerCase()}_demo`, d.city, d.share],
  );
}

for (const [day, set] of Object.entries(SEEDED_SETS)) {
  for (const d of DEMOS) {
    const votes = set.rollCall.map((b, i) => [b.id, d.lean[i] ? 'yea' : 'nay'] as const);
    for (const [billId, vote] of votes) {
      await query(
        `INSERT INTO votes (user_id, bill_id, day, vote) VALUES ($1, $2, $3, $4)
         ON CONFLICT (user_id, bill_id) DO UPDATE SET vote = EXCLUDED.vote`,
        [d.id, billId, day, vote],
      );
    }
    const agreedCount = set.rollCall.filter((b, i) => !!d.lean[i] === b.passed).length;
    // Answer the first fofRight captions correctly and the rest wrong.
    const answers = Object.fromEntries(set.filedOrFake.map((c, i) => [c.id, i < d.fofRight ? c.real : !c.real]));
    const answer = landslideAnswer(set.landslide.items);
    const order = d.landslideExact ? answer : [answer[1], answer[0], answer[3], answer[2]];
    const results: [string, number, object][] = [
      ['roll-call', agreedCount, {}],
      ['filed-or-fake', filedOrFakeScore(set.filedOrFake, answers), { answers }],
      ['landslide', landslidePoints(order, answer).reduce((a, b) => a + b, 0), { order }],
    ];
    // Sam skips Landslide, so the leaderboard shows "2 of 3 ballots".
    for (const [game, score, detail] of results) {
      if (d.id === 'demo-sam' && game === 'landslide') continue;
      await query(
        `INSERT INTO game_results (user_id, day, game, score, detail, finished_at)
         VALUES ($1, $2, $3, $4, $5, now())
         ON CONFLICT (user_id, day, game) DO UPDATE SET score = EXCLUDED.score, detail = EXCLUDED.detail, finished_at = now()`,
        [d.id, day, game, score, JSON.stringify(detail)],
      );
    }
  }
}

const real = target
  ? [target]
  : (await query<{ id: string }>('SELECT id FROM users WHERE NOT is_demo')).map((r) => r.id);
// Four demo friends; Taylor and Devin arrive as pending requests.
for (const uid of real) {
  for (const d of DEMOS.slice(0, 4)) {
    const [a, b] = uid < d.id ? [uid, d.id] : [d.id, uid];
    await query(`INSERT INTO friendships (user_a, user_b, source) VALUES ($1, $2, 'demo') ON CONFLICT DO NOTHING`, [a, b]);
  }
  await query(
    `INSERT INTO friend_requests (from_id, to_id, source) VALUES ('demo-taylor', $1, 'group'), ('demo-devin', $1, 'qr')
     ON CONFLICT (from_id, to_id) WHERE status = 'pending' DO NOTHING`,
    [uid],
  );
}
// A demo group with every demo account and every real account, so splits pass the 5-voter minimum.
let [group] = await query<{ id: string }>(`SELECT id FROM groups WHERE code = 'J4DEMO'`);
if (!group) {
  [group] = await query<{ id: string }>(
    `INSERT INTO groups (name, admin_id, code) VALUES ('Jester West, 4th floor', 'demo-priya', 'J4DEMO') RETURNING id`,
  );
}
for (const id of [...DEMOS.map((d) => d.id), ...real]) {
  await query(
    `INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
    [group.id, id, id === 'demo-priya' ? 'admin' : 'member'],
  );
}
console.log(`demo accounts ready; befriended ${real.length} account(s); demo group code J4DEMO`);
await pool.end();
