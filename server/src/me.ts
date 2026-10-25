import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { addDays, centralDay } from '../../src/lib/day.ts';
import { requireUser } from './auth.ts';
import { query } from './db.ts';

/** Played days, streaks and agreement, all from finished games on the server. */
export async function statsFor(uid: string) {
  const days = (
    await query<{ day: string }>(
      'SELECT DISTINCT day FROM game_results WHERE user_id = $1 AND finished_at IS NOT NULL ORDER BY day',
      [uid],
    )
  ).map((r) => r.day);

  let max = 0;
  let run = 0;
  for (let i = 0; i < days.length; i++) {
    run = i > 0 && addDays(days[i - 1], 1) === days[i] ? run + 1 : 1;
    max = Math.max(max, run);
  }
  const played = new Set(days);
  const today = centralDay();
  let current = 0;
  for (let d = played.has(today) ? today : addDays(today, -1); played.has(d); d = addDays(d, -1)) current += 1;

  // Agreement counts only bills from Roll Calls the player finished.
  const [agreement] = await query<{ agreed: string; voted: string; roll_calls: string }>(
    `SELECT count(*) FILTER (WHERE (v.vote = 'yea') = b.passed) AS agreed, count(*) AS voted,
            count(DISTINCT v.day) AS roll_calls
     FROM votes v
     JOIN bills b ON b.id = v.bill_id
     JOIN game_results r ON r.user_id = v.user_id AND r.day = v.day AND r.game = 'roll-call' AND r.finished_at IS NOT NULL
     WHERE v.user_id = $1`,
    [uid],
  );
  const voted = Number(agreement.voted);
  return {
    daysPlayed: days.length,
    rollCallsPlayed: Number(agreement.roll_calls),
    billsVoted: voted,
    agreementPct: voted ? Math.round((Number(agreement.agreed) / voted) * 100) : 0,
    currentStreak: current,
    maxStreak: max,
  };
}

const profilePatch = z.object({
  displayName: z.string().min(1).max(60).optional(),
  username: z
    .string()
    .regex(/^[a-z0-9_]{3,20}$/, 'Usernames are 3 to 20 lowercase letters, numbers or underscores.')
    .optional(),
  zip: z.string().regex(/^\d{5}$/).optional(),
  issues: z.array(z.string()).max(12).optional(),
  shareVotes: z.boolean().optional(),
  allowUsername: z.boolean().optional(),
  matchContacts: z.boolean().optional(),
  onboarded: z.boolean().optional(),
});

const COLUMNS: Record<string, string> = {
  displayName: 'display_name',
  username: 'username',
  zip: 'zip',
  issues: 'issues',
  shareVotes: 'share_votes',
  allowUsername: 'allow_username',
  matchContacts: 'match_contacts',
  onboarded: 'onboarded',
};

type UserRow = {
  id: string;
  username: string | null;
  display_name: string | null;
  zip: string | null;
  state: string | null;
  county: string | null;
  city: string | null;
  districts: unknown;
  issues: string[];
  share_votes: boolean;
  allow_username: boolean;
  match_contacts: boolean;
  onboarded: boolean;
  created_at: string;
};

export function toProfile(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    zip: u.zip,
    state: u.state,
    county: u.county,
    city: u.city,
    districts: u.districts,
    issues: u.issues,
    shareVotes: u.share_votes,
    allowUsername: u.allow_username,
    matchContacts: u.match_contacts,
    onboarded: u.onboarded,
    createdAt: u.created_at,
  };
}

export async function meRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/me', async (req) => {
    const [u] = await query<UserRow>('SELECT * FROM users WHERE id = $1', [req.uid]);
    return { profile: toProfile(u), stats: await statsFor(req.uid) };
  });

  app.patch('/me', async (req, reply) => {
    const patch = profilePatch.parse(req.body);
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length) {
      const sets = entries.map(([k], i) => `${COLUMNS[k]} = $${i + 2}`).join(', ');
      try {
        await query(`UPDATE users SET ${sets} WHERE id = $1`, [req.uid, ...entries.map(([, v]) => v)]);
      } catch (err) {
        if ((err as { code?: string }).code === '23505') return reply.code(409).send({ error: 'That username is taken.' });
        throw err;
      }
    }
    const [u] = await query<UserRow>('SELECT * FROM users WHERE id = $1', [req.uid]);
    return { profile: toProfile(u) };
  });
}
