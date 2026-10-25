import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

import { addDays, centralDay } from '../../src/lib/day.ts';
import { requireUser } from './auth.ts';
import { lookupZip } from './geo.ts';
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

  const [games] = await query<{ fof_right: string | null; fof_played: string; ls_points: string | null; ls_played: string }>(
    `SELECT sum(score) FILTER (WHERE game = 'filed-or-fake') AS fof_right,
            count(*) FILTER (WHERE game = 'filed-or-fake') AS fof_played,
            sum(score) FILTER (WHERE game = 'landslide') AS ls_points,
            count(*) FILTER (WHERE game = 'landslide') AS ls_played
     FROM game_results WHERE user_id = $1 AND finished_at IS NOT NULL`,
    [uid],
  );
  const fofPlayed = Number(games.fof_played);
  const lsPlayed = Number(games.ls_played);

  // Issues: most-voted topics first, with the share of Yea votes on each.
  const issues = await query<{ topic: string; votes: string; yea: string }>(
    `SELECT b.topic, count(*) AS votes, count(*) FILTER (WHERE v.vote = 'yea') AS yea
     FROM votes v JOIN bills b ON b.id = v.bill_id WHERE v.user_id = $1
     GROUP BY b.topic ORDER BY count(*) DESC, b.topic`,
    [uid],
  );
  const week = await query<{ day: string }>(
    `SELECT DISTINCT day FROM game_results
     WHERE user_id = $1 AND finished_at IS NOT NULL AND day > $2::date - 7`,
    [uid, today],
  );

  return {
    byGame: {
      rollCallAgreementPct: voted ? Math.round((Number(agreement.agreed) / voted) * 100) : null,
      filedOrFakePct: fofPlayed ? Math.round((Number(games.fof_right) / (fofPlayed * 8)) * 100) : null,
      landslideAvg: lsPlayed ? Math.round(Number(games.ls_points) / lsPlayed) : null,
    },
    issues: issues.map((i) => ({ topic: i.topic, votes: Number(i.votes), yeaPct: Math.round((Number(i.yea) / Number(i.votes)) * 100) })),
    weekPlayed: week.map((w) => w.day),
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
  dailyReminder: z.boolean().optional(),
  notifyFriendPasses: z.boolean().optional(),
  notifyStreakRisk: z.boolean().optional(),
  notifyWeeklyRecap: z.boolean().optional(),
  notifyRequests: z.boolean().optional(),
  notifyOppositeVote: z.boolean().optional(),
  groupBoards: z.boolean().optional(),
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
  dailyReminder: 'daily_reminder',
  notifyFriendPasses: 'notify_friend_passes',
  notifyStreakRisk: 'notify_streak_risk',
  notifyWeeklyRecap: 'notify_weekly_recap',
  notifyRequests: 'notify_requests',
  notifyOppositeVote: 'notify_opposite_vote',
  groupBoards: 'group_boards',
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
  daily_reminder: boolean;
  notify_friend_passes: boolean;
  notify_streak_risk: boolean;
  notify_weekly_recap: boolean;
  notify_requests: boolean;
  notify_opposite_vote: boolean;
  group_boards: boolean;
  is_demo: boolean;
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
    dailyReminder: u.daily_reminder,
    notifyFriendPasses: u.notify_friend_passes,
    notifyStreakRisk: u.notify_streak_risk,
    notifyWeeklyRecap: u.notify_weekly_recap,
    notifyRequests: u.notify_requests,
    // Only possible when both people share votes; the app explains that next to the switch.
    notifyOppositeVote: u.notify_opposite_vote,
    groupBoards: u.group_boards,
    createdAt: u.created_at,
  };
}

export async function meRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  // Preview what a ZIP covers before saving it.
  app.get<{ Params: { zip: string } }>('/geo/:zip', async (req, reply) => {
    if (!/^\d{5}$/.test(req.params.zip)) return reply.code(400).send({ error: 'Enter a 5-digit ZIP code.' });
    const loc = await lookupZip(req.params.zip);
    if (!loc) return reply.code(404).send({ error: "Docket covers Texas ZIP codes for now. Check the number and try again." });
    return loc;
  });

  // Saves state, county, city and districts. The ZIP is kept; never a street address.
  app.post('/me/location', async (req, reply) => {
    const { zip } = z.object({ zip: z.string().regex(/^\d{5}$/, 'Enter a 5-digit ZIP code.') }).parse(req.body);
    const loc = await lookupZip(zip);
    if (!loc) return reply.code(404).send({ error: "Docket covers Texas ZIP codes for now. Check the number and try again." });
    const [u] = await query<UserRow>(
      `UPDATE users SET zip = $2, state = $3, county = $4, city = $5, districts = $6 WHERE id = $1 RETURNING *`,
      [req.uid, zip, loc.state, loc.county, loc.city, JSON.stringify(loc.districts)],
    );
    return { profile: toProfile(u), location: loc };
  });

  app.get('/me', async (req) => {
    const [u] = await query<UserRow>('SELECT * FROM users WHERE id = $1', [req.uid]);
    return { profile: toProfile(u), stats: await statsFor(req.uid) };
  });

  const patchMe = async (req: FastifyRequest, reply: FastifyReply) => {
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
  };
  app.patch('/me', patchMe);

  // Removes the account row; votes, results, friendships and memberships cascade.
  app.delete('/me', async (req) => {
    await query('DELETE FROM groups WHERE admin_id = $1', [req.uid]);
    await query('DELETE FROM users WHERE id = $1', [req.uid]);
    return { ok: true };
  });
  app.patch('/settings', patchMe);
}
