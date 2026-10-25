import { randomBytes } from 'node:crypto';

import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { centralDay } from '../../src/lib/day.ts';
import { requireUser } from './auth.ts';
import { setFor } from './content.ts';
import { query } from './db.ts';

// Leak guards. Every figure about another person passes through these, on the server.
export const MIN_SHARED_OVERALL = 10;
export const MIN_SHARED_TOPIC = 5;
const REQUEST_TTL_DAYS = 30;

const pair = (a: string, b: string) => (a < b ? [a, b] : [b, a]);

export async function areFriends(a: string, b: string) {
  const [x, y] = pair(a, b);
  const rows = await query('SELECT 1 FROM friendships WHERE user_a = $1 AND user_b = $2', [x, y]);
  return rows.length > 0;
}

export async function isBlocked(a: string, b: string) {
  const rows = await query(
    'SELECT 1 FROM blocks WHERE (blocker_id = $1 AND blocked_id = $2) OR (blocker_id = $2 AND blocked_id = $1)',
    [a, b],
  );
  return rows.length > 0;
}

async function befriend(a: string, b: string, source: string) {
  const [x, y] = pair(a, b);
  await query('INSERT INTO friendships (user_a, user_b, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [x, y, source]);
  await query(`UPDATE friend_requests SET status = 'accepted' WHERE status = 'pending' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))`, [a, b]);
}

async function unfriend(a: string, b: string) {
  const [x, y] = pair(a, b);
  await query('DELETE FROM friendships WHERE user_a = $1 AND user_b = $2', [x, y]);
}

/** Per-bill votes are visible only when both people share with each other. */
export async function mutualSharing(a: string, b: string) {
  const rows = await query<{ id: string; share: boolean }>(
    `SELECT u.id, COALESCE(o.share, u.share_votes) AS share
     FROM users u LEFT JOIN share_overrides o ON o.user_id = u.id AND o.friend_id = CASE WHEN u.id = $1 THEN $2 ELSE $1 END
     WHERE u.id IN ($1, $2)`,
    [a, b],
  );
  return rows.length === 2 && rows.every((r) => r.share);
}

export async function agreementBetween(a: string, b: string) {
  const [overall] = await query<{ agreed: string; shared: string }>(
    `SELECT count(*) FILTER (WHERE x.vote = y.vote) AS agreed, count(*) AS shared
     FROM votes x JOIN votes y ON x.bill_id = y.bill_id WHERE x.user_id = $1 AND y.user_id = $2`,
    [a, b],
  );
  const shared = Number(overall.shared);
  const agreed = Number(overall.agreed);
  const topics = await query<{ topic: string; agreed: string; shared: string }>(
    `SELECT bl.topic, count(*) FILTER (WHERE x.vote = y.vote) AS agreed, count(*) AS shared
     FROM votes x JOIN votes y ON x.bill_id = y.bill_id JOIN bills bl ON bl.id = x.bill_id
     WHERE x.user_id = $1 AND y.user_id = $2 GROUP BY bl.topic ORDER BY count(*) DESC`,
    [a, b],
  );
  return {
    shared,
    // Only after 10 shared bills, so a single day can't reveal individual votes.
    agreedCount: shared >= MIN_SHARED_OVERALL ? agreed : null,
    pct: shared >= MIN_SHARED_OVERALL ? Math.round((agreed / shared) * 100) : null,
    topics: topics
      .filter((t) => Number(t.shared) >= MIN_SHARED_TOPIC)
      .map((t) => ({ topic: t.topic, pct: Math.round((Number(t.agreed) / Number(t.shared)) * 100), shared: Number(t.shared) })),
  };
}

/** "X of N" for one day; hidden when X is 0 or N, since that would reveal every vote. */
export async function dailyAgreement(a: string, b: string, day: string) {
  const [row] = await query<{ agreed: string; shared: string }>(
    `SELECT count(*) FILTER (WHERE x.vote = y.vote) AS agreed, count(*) AS shared
     FROM votes x JOIN votes y ON x.bill_id = y.bill_id
     JOIN game_results rx ON rx.user_id = x.user_id AND rx.day = x.day AND rx.game = 'roll-call' AND rx.finished_at IS NOT NULL
     JOIN game_results ry ON ry.user_id = y.user_id AND ry.day = y.day AND ry.game = 'roll-call' AND ry.finished_at IS NOT NULL
     WHERE x.user_id = $1 AND y.user_id = $2 AND x.day = $3`,
    [a, b, day],
  );
  const agreed = Number(row.agreed);
  const total = Number(row.shared);
  if (!total) return { played: false as const };
  return { played: true as const, total, agreed: agreed > 0 && agreed < total ? agreed : null };
}

/** Daily points: 5 for casting a full Roll Call (agreement is never scored), Filed or Fake right answers, Landslide points. */
const POINTS_SQL = `
  SELECT r.user_id,
         sum(CASE WHEN r.game = 'roll-call' THEN 5 ELSE COALESCE(r.score, 0) END)::int AS points,
         count(*)::int AS games
  FROM game_results r WHERE r.day = $1 AND r.finished_at IS NOT NULL GROUP BY r.user_id`;

export async function friendIds(uid: string) {
  const rows = await query<{ id: string }>(
    `SELECT CASE WHEN user_a = $1 THEN user_b ELSE user_a END AS id FROM friendships WHERE user_a = $1 OR user_b = $1`,
    [uid],
  );
  return rows.map((r) => r.id);
}

type Person = { id: string; display_name: string | null; username: string | null; is_demo: boolean };
const nameOf = (p: Person) => p.display_name || (p.username ? `@${p.username}` : 'Docket player');

async function leaderboard(uid: string, day: string) {
  const ids = [uid, ...(await friendIds(uid))];
  const rows = await query<Person & { points: number | null; games: number | null }>(
    `WITH pts AS (${POINTS_SQL})
     SELECT u.id, u.display_name, u.username, u.is_demo, pts.points, pts.games
     FROM users u LEFT JOIN pts ON pts.user_id = u.id WHERE u.id = ANY($2)`,
    [day, ids],
  );
  const streaks = await currentStreaks(ids, day);
  const board = rows
    .map((r) => ({
      id: r.id,
      name: r.id === uid ? 'You' : nameOf(r),
      isYou: r.id === uid,
      isDemo: r.is_demo,
      points: r.points ?? 0,
      games: r.games ?? 0,
      streak: streaks.get(r.id) ?? 0,
      playedToday: (r.games ?? 0) > 0,
    }))
    .sort((a, b) => b.points - a.points || a.name.localeCompare(b.name));

  const [me] = await query<{ city: string | null; state: string | null }>('SELECT city, state FROM users WHERE id = $1', [uid]);
  const avg = async (where: string, params: unknown[]) => {
    const [r] = await query<{ avg: string | null; n: string }>(
      `WITH pts AS (${POINTS_SQL}) SELECT avg(pts.points) AS avg, count(*) AS n FROM pts JOIN users u ON u.id = pts.user_id ${where}`,
      [day, ...params],
    );
    return Number(r.n) ? Math.round(Number(r.avg)) : null;
  };
  return {
    day,
    board,
    beyond: [
      me?.city ? { label: `${me.city} players, average`, points: await avg('WHERE u.city = $2', [me.city]) } : null,
      me?.state ? { label: `${me.state === 'TX' ? 'Texas' : me.state} players, average`, points: await avg('WHERE u.state = $2', [me.state]) } : null,
      { label: 'Everyone on Docket, average', points: await avg('', []) },
    ].filter(Boolean),
  };
}

async function currentStreaks(ids: string[], today: string) {
  const rows = await query<{ user_id: string; day: string }>(
    `SELECT DISTINCT user_id, day FROM game_results WHERE user_id = ANY($1) AND finished_at IS NOT NULL AND day > $2::date - 60`,
    [ids, today],
  );
  const days = new Map<string, Set<string>>();
  for (const r of rows) days.set(r.user_id, (days.get(r.user_id) ?? new Set()).add(r.day));
  const out = new Map<string, number>();
  for (const id of ids) {
    const set = days.get(id) ?? new Set();
    let d = new Date(`${today}T12:00:00Z`);
    if (!set.has(today)) d.setUTCDate(d.getUTCDate() - 1);
    let n = 0;
    while (set.has(d.toISOString().slice(0, 10))) {
      n += 1;
      d.setUTCDate(d.getUTCDate() - 1);
    }
    out.set(id, n);
  }
  return out;
}

async function inviteFor(uid: string) {
  const [existing] = await query<{ token: string }>('SELECT token FROM invites WHERE inviter_id = $1 AND NOT revoked LIMIT 1', [uid]);
  if (existing) return existing.token;
  const token = randomBytes(9).toString('base64url');
  await query('INSERT INTO invites (token, inviter_id) VALUES ($1, $2)', [token, uid]);
  return token;
}

export async function socialRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/friends', async (req) => {
    const uid = req.uid;
    const today = (await setFor(centralDay()))?.day ?? centralDay();
    const ids = await friendIds(uid);
    const people = await query<Person>('SELECT id, display_name, username, is_demo FROM users WHERE id = ANY($1)', [ids]);
    const friends = await Promise.all(
      people.map(async (p) => {
        const a = await agreementBetween(uid, p.id);
        return {
          id: p.id,
          name: nameOf(p),
          isDemo: p.is_demo,
          agreementPct: a.pct,
          sharedBills: a.shared,
          votesShared: await mutualSharing(uid, p.id),
          today: await dailyAgreement(uid, p.id, today),
        };
      }),
    );
    friends.sort((a, b) => (b.agreementPct ?? -1) - (a.agreementPct ?? -1) || a.name.localeCompare(b.name));

    const requests = await query<Person & { request_id: string; source: string }>(
      `SELECT r.id AS request_id, r.source, u.id, u.display_name, u.username, u.is_demo
       FROM friend_requests r JOIN users u ON u.id = r.from_id
       WHERE r.to_id = $1 AND r.status = 'pending' AND r.created_at > now() - interval '${REQUEST_TTL_DAYS} days'
       ORDER BY r.created_at DESC`,
      [uid],
    );
    return {
      friends,
      requests: requests.map((r) => ({ id: r.request_id, from: { id: r.id, name: nameOf(r) }, source: r.source })),
      leaderboard: await leaderboard(uid, today),
    };
  });

  app.get('/leaderboard', async (req) => {
    const today = (await setFor(centralDay()))?.day ?? centralDay();
    return leaderboard(req.uid, today);
  });

  app.get<{ Params: { id: string } }>('/friends/:id', async (req, reply) => {
    const uid = req.uid;
    const other = req.params.id;
    if (!(await areFriends(uid, other))) return reply.code(404).send({ error: 'Not on your friends list.' });
    const [p] = await query<Person>('SELECT id, display_name, username, is_demo FROM users WHERE id = $1', [other]);
    const a = await agreementBetween(uid, other);
    const sharing = await mutualSharing(uid, other);
    const [override] = await query<{ share: boolean }>('SELECT share FROM share_overrides WHERE user_id = $1 AND friend_id = $2', [uid, other]);
    // Raw per-bill votes leave the server only under the mutual-sharing rule.
    const recent = sharing
      ? await query<{ number: string; short_title: string; mine: string; theirs: string }>(
          `SELECT bl.number, bl.short_title, x.vote AS mine, y.vote AS theirs
           FROM votes x JOIN votes y ON x.bill_id = y.bill_id JOIN bills bl ON bl.id = x.bill_id
           WHERE x.user_id = $1 AND y.user_id = $2 ORDER BY x.day DESC, bl.number LIMIT 10`,
          [uid, other],
        )
      : [];
    return {
      id: p.id,
      name: nameOf(p),
      isDemo: p.is_demo,
      agreement: { pct: a.pct, agreed: a.agreedCount, shared: a.shared, minShared: MIN_SHARED_OVERALL },
      topics: a.topics,
      votesShared: sharing,
      myOverride: override?.share ?? null,
      recent: recent.map((r) => ({ number: r.number, title: r.short_title, mine: r.mine, theirs: r.theirs })),
    };
  });

  // Per-friend override of "Share my vote on each bill". null clears it.
  app.put<{ Params: { id: string } }>('/friends/:id/sharing', async (req, reply) => {
    const { share } = z.object({ share: z.boolean().nullable() }).parse(req.body);
    if (!(await areFriends(req.uid, req.params.id))) return reply.code(404).send({ error: 'Not on your friends list.' });
    if (share === null) await query('DELETE FROM share_overrides WHERE user_id = $1 AND friend_id = $2', [req.uid, req.params.id]);
    else
      await query(
        `INSERT INTO share_overrides (user_id, friend_id, share) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, friend_id) DO UPDATE SET share = EXCLUDED.share`,
        [req.uid, req.params.id, share],
      );
    return { ok: true };
  });

  // Remove is silent: the other person is not told.
  app.delete<{ Params: { id: string } }>('/friends/:id', async (req) => {
    await unfriend(req.uid, req.params.id);
    return { ok: true };
  });

  // Block is silent too, and also stops future requests.
  app.post('/blocks', async (req) => {
    const { userId } = z.object({ userId: z.string() }).parse(req.body);
    await unfriend(req.uid, userId);
    await query('INSERT INTO blocks (blocker_id, blocked_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.uid, userId]);
    await query(`UPDATE friend_requests SET status = 'ignored' WHERE status = 'pending' AND ((from_id = $1 AND to_id = $2) OR (from_id = $2 AND to_id = $1))`, [req.uid, userId]);
    return { ok: true };
  });

  app.get('/blocks', async (req) => {
    const rows = await query<Person>(
      'SELECT u.id, u.display_name, u.username, u.is_demo FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = $1',
      [req.uid],
    );
    return { blocked: rows.map((r) => ({ id: r.id, name: nameOf(r) })) };
  });

  app.delete<{ Params: { id: string } }>('/blocks/:id', async (req) => {
    await query('DELETE FROM blocks WHERE blocker_id = $1 AND blocked_id = $2', [req.uid, req.params.id]);
    return { ok: true };
  });

  // Username, contacts or group member: a request the other person accepts or silently ignores.
  app.post('/friend-requests', async (req, reply) => {
    const { username } = z.object({ username: z.string().min(1) }).parse(req.body);
    const handle = username.replace(/^@/, '').toLowerCase();
    const [target] = await query<{ id: string; allow_username: boolean }>('SELECT id, allow_username FROM users WHERE username = $1', [handle]);
    // Same answer whether the username is missing, private or blocked, so nobody can probe.
    const notFound = () => reply.code(404).send({ error: `No one can be added as @${handle}.` });
    if (!target || !target.allow_username || target.id === req.uid) return notFound();
    if (await isBlocked(req.uid, target.id)) return notFound();
    if (await areFriends(req.uid, target.id)) return { ok: true, alreadyFriends: true };
    await query(
      `INSERT INTO friend_requests (from_id, to_id, source) VALUES ($1, $2, 'username')
       ON CONFLICT (from_id, to_id) WHERE status = 'pending' DO NOTHING`,
      [req.uid, target.id],
    );
    return { ok: true };
  });

  app.post<{ Params: { id: string; action: string } }>('/friend-requests/:id/:action', async (req, reply) => {
    const { id, action } = req.params;
    if (action !== 'accept' && action !== 'ignore') return reply.code(404).send({ error: 'Unknown action.' });
    const [r] = await query<{ from_id: string; source: string }>(
      `SELECT from_id, source FROM friend_requests WHERE id = $1 AND to_id = $2 AND status = 'pending'`,
      [id, req.uid],
    );
    if (!r) return reply.code(404).send({ error: 'That request is gone.' });
    if (action === 'accept') await befriend(req.uid, r.from_id, r.source);
    else await query(`UPDATE friend_requests SET status = 'ignored' WHERE id = $1`, [id]);
    return { ok: true };
  });

  // The inviter's personal token, used for both the link and the QR code.
  app.post('/invites', async (req) => ({ token: await inviteFor(req.uid) }));

  app.get<{ Params: { token: string } }>('/invites/:token', async (req, reply) => {
    const [inv] = await query<Person & { inviter_id: string }>(
      `SELECT i.inviter_id, u.id, u.display_name, u.username, u.is_demo
       FROM invites i JOIN users u ON u.id = i.inviter_id WHERE i.token = $1 AND NOT i.revoked`,
      [req.params.token],
    );
    if (!inv) return reply.code(404).send({ error: 'That invite link has expired.' });
    return { inviter: { id: inv.id, name: nameOf(inv) }, isSelf: inv.id === req.uid, alreadyFriends: await areFriends(req.uid, inv.id) };
  });

  // Link or QR: friends right away (with Undo in the app), plus today's comparison when both played.
  app.post<{ Params: { token: string } }>('/invites/:token/accept', async (req, reply) => {
    const { via } = z.object({ via: z.enum(['link', 'qr']).default('link') }).parse(req.body ?? {});
    const [inv] = await query<{ inviter_id: string }>('SELECT inviter_id FROM invites WHERE token = $1 AND NOT revoked', [req.params.token]);
    if (!inv) return reply.code(404).send({ error: 'That invite link has expired.' });
    if (inv.inviter_id === req.uid) return reply.code(400).send({ error: "That's your own invite." });
    if (await isBlocked(req.uid, inv.inviter_id)) return reply.code(404).send({ error: 'That invite link has expired.' });
    const already = await areFriends(req.uid, inv.inviter_id);
    await befriend(req.uid, inv.inviter_id, via === 'qr' ? 'qr' : 'invite');
    const today = (await setFor(centralDay()))?.day ?? centralDay();
    const [p] = await query<Person>('SELECT id, display_name, username, is_demo FROM users WHERE id = $1', [inv.inviter_id]);
    return { inviter: { id: p.id, name: nameOf(p) }, alreadyFriends: already, today: await dailyAgreement(req.uid, inv.inviter_id, today) };
  });

  app.post<{ Params: { token: string } }>('/invites/:token/undo', async (req) => {
    const [inv] = await query<{ inviter_id: string }>('SELECT inviter_id FROM invites WHERE token = $1', [req.params.token]);
    if (inv) await unfriend(req.uid, inv.inviter_id);
    return { ok: true };
  });

  // Friends' results today for the Roll Call results screen, with the daily leak guard applied.
  app.get('/friends/today', async (req) => {
    const today = (await setFor(centralDay()))?.day ?? centralDay();
    const ids = await friendIds(req.uid);
    const people = await query<Person>('SELECT id, display_name, username, is_demo FROM users WHERE id = ANY($1)', [ids]);
    const rows = await Promise.all(people.map(async (p) => ({ id: p.id, name: nameOf(p), ...(await dailyAgreement(req.uid, p.id, today)) })));
    return { day: today, friends: rows.filter((r) => r.played) };
  });
}
