import { randomInt } from 'node:crypto';

import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';

import { addDays, centralDay } from '../../src/lib/day.ts';
import { requireUser } from './auth.ts';
import { setFor } from './content.ts';
import { query } from './db.ts';

export const MAX_MEMBERS = 50;
export const MIN_SPLIT_VOTERS = 5;
export const MIN_UNANIMOUS_VOTERS = 10;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const newCode = () => Array.from({ length: 6 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');

/** Monday of the Central-time week, as YYYY-MM-DD. Leaderboards reset Monday. */
function weekStart(day: string) {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export function badgeFor(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return words
    .slice(0, 2)
    .map((w) => (/\d/.test(w) ? w.replace(/\D/g, '').slice(0, 1) : w[0]))
    .join('')
    .toUpperCase();
}

type GroupRow = { id: string; name: string; admin_id: string; code: string; approval_required: boolean };

async function membership(groupId: string, uid: string) {
  const [m] = await query<{ role: string; status: string; include_in_splits: boolean }>(
    'SELECT role, status, include_in_splits FROM group_members WHERE group_id = $1 AND user_id = $2',
    [groupId, uid],
  );
  return m ?? null;
}

async function requireAdmin(groupId: string, uid: string, reply: FastifyReply) {
  const m = await membership(groupId, uid);
  if (m?.role !== 'admin') {
    reply.code(403).send({ error: 'Only the group admin can do that.' });
    return false;
  }
  return true;
}

/** Weekly points per active member. Blocked pairs don't see each other's rank. */
async function weeklyBoard(groupId: string, uid: string, today: string) {
  const rows = await query<{ id: string; name: string; points: number }>(
    `SELECT u.id, COALESCE(u.display_name, '@' || u.username, 'Docket player') AS name,
            COALESCE(sum(CASE WHEN r.game = 'roll-call' THEN 5 ELSE COALESCE(r.score, 0) END), 0)::int AS points
     FROM group_members m JOIN users u ON u.id = m.user_id
     LEFT JOIN game_results r ON r.user_id = u.id AND r.finished_at IS NOT NULL AND r.day BETWEEN $2 AND $3
     WHERE m.group_id = $1 AND m.status = 'active' AND (u.group_boards OR u.id = $4)
       AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id = $4 AND b.blocked_id = u.id) OR (b.blocker_id = u.id AND b.blocked_id = $4))
     GROUP BY u.id, name ORDER BY points DESC, name`,
    [groupId, weekStart(today), today, uid],
  );
  return rows.map((r) => ({ ...r, isYou: r.id === uid, name: r.id === uid ? 'You' : r.name }));
}

/** Per-bill Yea share among members who count themselves in splits. Never per person. */
async function splits(groupId: string, from: string, to: string) {
  const rows = await query<{ bill_id: string; number: string; short_title: string; topic: string; voters: string; yea: string; day: string }>(
    `SELECT v.bill_id, b.number, b.short_title, b.topic, v.day, count(*) AS voters, count(*) FILTER (WHERE v.vote = 'yea') AS yea
     FROM votes v JOIN group_members m ON m.user_id = v.user_id JOIN bills b ON b.id = v.bill_id
     WHERE m.group_id = $1 AND m.status = 'active' AND m.include_in_splits AND v.day BETWEEN $2 AND $3
     GROUP BY v.bill_id, b.number, b.short_title, b.topic, v.day`,
    [groupId, from, to],
  );
  return rows.map((r) => {
    const voters = Number(r.voters);
    const share = Number(r.yea) / voters;
    const unanimous = share === 0 || share === 1;
    const visible = voters >= MIN_SPLIT_VOTERS && (!unanimous || voters >= MIN_UNANIMOUS_VOTERS);
    return {
      billId: r.bill_id,
      number: r.number,
      title: r.short_title,
      topic: r.topic,
      day: r.day,
      voters,
      yeaPct: visible ? Math.round(share * 100) : null,
      hiddenReason: visible ? null : voters < MIN_SPLIT_VOTERS ? 'few' : 'unanimous',
    };
  });
}

function recap(week: Awaited<ReturnType<typeof splits>>) {
  const shown = week.filter((s) => s.yeaPct !== null);
  if (shown.length < 2) return null;
  const byTopic = new Map<string, number[]>();
  for (const s of shown) byTopic.set(s.topic, [...(byTopic.get(s.topic) ?? []), Math.abs(s.yeaPct! - 50)]);
  const agreedTopic = [...byTopic.entries()].sort(
    (a, b) => b[1].reduce((x, y) => x + y, 0) / b[1].length - a[1].reduce((x, y) => x + y, 0) / a[1].length,
  )[0][0];
  const splitBill = [...shown].sort((a, b) => Math.abs(a.yeaPct! - 50) - Math.abs(b.yeaPct! - 50))[0];
  return `Your group agreed most on ${agreedTopic.toLowerCase()} and split most on ${splitBill.number}.`;
}

export async function groupRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/groups', async (req) => {
    const today = (await setFor(centralDay()))?.day ?? centralDay();
    const groups = await query<GroupRow & { members: string; status: string }>(
      `SELECT g.*, m.status, (SELECT count(*) FROM group_members x WHERE x.group_id = g.id AND x.status = 'active') AS members
       FROM groups g JOIN group_members m ON m.group_id = g.id AND m.user_id = $1 ORDER BY g.created_at`,
      [req.uid],
    );
    return {
      groups: await Promise.all(
        groups.map(async (g) => {
          const board = g.status === 'active' ? await weeklyBoard(g.id, req.uid, today) : [];
          const rank = board.findIndex((r) => r.isYou) + 1;
          return { id: g.id, name: g.name, badge: badgeFor(g.name), members: Number(g.members), pending: g.status === 'pending', rank: rank || null };
        }),
      ),
    };
  });

  app.post('/groups', async (req) => {
    const body = z.object({ name: z.string().trim().min(2).max(40), approvalRequired: z.boolean().default(false) }).parse(req.body);
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [g] = await query<GroupRow>(
          'INSERT INTO groups (name, admin_id, code, approval_required) VALUES ($1, $2, $3, $4) RETURNING *',
          [body.name, req.uid, newCode(), body.approvalRequired],
        );
        await query(`INSERT INTO group_members (group_id, user_id, role) VALUES ($1, $2, 'admin')`, [g.id, req.uid]);
        return { id: g.id, code: g.code };
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err;
      }
    }
    throw new Error('Could not make a unique group code.');
  });

  // The preview screen before joining, for links, QR codes and typed codes.
  app.get<{ Params: { code: string } }>('/groups/preview/:code', async (req, reply) => {
    const [g] = await query<GroupRow & { admin_name: string | null; members: string }>(
      `SELECT g.*, u.display_name AS admin_name,
              (SELECT count(*) FROM group_members x WHERE x.group_id = g.id AND x.status = 'active') AS members
       FROM groups g JOIN users u ON u.id = g.admin_id WHERE g.code = $1`,
      [req.params.code.toUpperCase()],
    );
    if (!g) return reply.code(404).send({ error: 'No group has that code. Check it and try again.' });
    const m = await membership(g.id, req.uid);
    return {
      id: g.id,
      name: g.name,
      badge: badgeFor(g.name),
      members: Number(g.members),
      full: Number(g.members) >= MAX_MEMBERS,
      adminName: g.admin_name ?? 'The admin',
      approvalRequired: g.approval_required,
      status: m?.status ?? null,
    };
  });

  app.post('/groups/join', async (req, reply) => {
    const { code } = z.object({ code: z.string().trim().length(6) }).parse(req.body);
    const [g] = await query<GroupRow>('SELECT * FROM groups WHERE code = $1', [code.toUpperCase()]);
    if (!g) return reply.code(404).send({ error: 'No group has that code. Check it and try again.' });
    const existing = await membership(g.id, req.uid);
    if (existing) return { id: g.id, status: existing.status };
    const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM group_members WHERE group_id = $1 AND status = 'active'`, [g.id]);
    if (Number(n) >= MAX_MEMBERS) return reply.code(409).send({ error: `This group is full (${MAX_MEMBERS} members).` });
    const status = g.approval_required ? 'pending' : 'active';
    await query('INSERT INTO group_members (group_id, user_id, status) VALUES ($1, $2, $3)', [g.id, req.uid, status]);
    return { id: g.id, status };
  });

  app.get<{ Params: { id: string } }>('/groups/:id', async (req, reply) => {
    const { id } = req.params;
    const m = await membership(id, req.uid);
    if (!m || m.status !== 'active') return reply.code(404).send({ error: "You're not in this group yet." });
    const [g] = await query<GroupRow>('SELECT * FROM groups WHERE id = $1', [id]);
    const today = (await setFor(centralDay()))?.day ?? centralDay();
    const [{ members, played }] = await query<{ members: string; played: string }>(
      `SELECT count(*) AS members,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM game_results r WHERE r.user_id = m.user_id AND r.day = $2 AND r.finished_at IS NOT NULL)) AS played
       FROM group_members m WHERE m.group_id = $1 AND m.status = 'active'`,
      [id, today],
    );
    const week = await splits(id, weekStart(today), today);
    const isAdmin = m.role === 'admin';
    const people = isAdmin
      ? await query<{ id: string; name: string; status: string; role: string }>(
          `SELECT u.id, COALESCE(u.display_name, '@' || u.username, 'Docket player') AS name, m.status, m.role
           FROM group_members m JOIN users u ON u.id = m.user_id WHERE m.group_id = $1 ORDER BY m.status DESC, name`,
          [id],
        )
      : [];
    return {
      id: g.id,
      name: g.name,
      badge: badgeFor(g.name),
      members: Number(members),
      playedToday: Number(played),
      code: g.code,
      approvalRequired: g.approval_required,
      isAdmin,
      includeInSplits: m.include_in_splits,
      board: await weeklyBoard(id, req.uid, today),
      today: week.filter((s) => s.day === today).sort((a, b) => b.voters - a.voters),
      recap: recap(week),
      minVoters: MIN_SPLIT_VOTERS,
      people: people.map((p) => ({ ...p, isYou: p.id === req.uid })),
    };
  });

  // Member's own setting: "Count me in group splits".
  app.patch<{ Params: { id: string } }>('/groups/:id/me', async (req) => {
    const { includeInSplits } = z.object({ includeInSplits: z.boolean() }).parse(req.body);
    await query('UPDATE group_members SET include_in_splits = $3 WHERE group_id = $1 AND user_id = $2', [req.params.id, req.uid, includeInSplits]);
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>('/groups/:id', async (req, reply) => {
    if (!(await requireAdmin(req.params.id, req.uid, reply))) return;
    const body = z.object({ name: z.string().trim().min(2).max(40).optional(), approvalRequired: z.boolean().optional() }).parse(req.body);
    if (body.name) await query('UPDATE groups SET name = $2 WHERE id = $1', [req.params.id, body.name]);
    if (body.approvalRequired !== undefined) await query('UPDATE groups SET approval_required = $2 WHERE id = $1', [req.params.id, body.approvalRequired]);
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>('/groups/:id/reset-code', async (req, reply) => {
    if (!(await requireAdmin(req.params.id, req.uid, reply))) return;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const [g] = await query<{ code: string }>('UPDATE groups SET code = $2 WHERE id = $1 RETURNING code', [req.params.id, newCode()]);
        return { code: g.code };
      } catch (err) {
        if ((err as { code?: string }).code !== '23505') throw err;
      }
    }
    throw new Error('Could not make a unique group code.');
  });

  app.post<{ Params: { id: string; uid: string } }>('/groups/:id/members/:uid/approve', async (req, reply) => {
    if (!(await requireAdmin(req.params.id, req.uid, reply))) return;
    const [{ n }] = await query<{ n: string }>(`SELECT count(*) AS n FROM group_members WHERE group_id = $1 AND status = 'active'`, [req.params.id]);
    if (Number(n) >= MAX_MEMBERS) return reply.code(409).send({ error: `This group is full (${MAX_MEMBERS} members).` });
    await query(`UPDATE group_members SET status = 'active' WHERE group_id = $1 AND user_id = $2`, [req.params.id, req.params.uid]);
    return { ok: true };
  });

  // Admins remove anyone; anyone can remove themselves (leave).
  app.delete<{ Params: { id: string; uid: string } }>('/groups/:id/members/:uid', async (req, reply) => {
    const target = req.params.uid === 'me' ? req.uid : req.params.uid;
    if (target !== req.uid && !(await requireAdmin(req.params.id, req.uid, reply))) return;
    await query('DELETE FROM group_members WHERE group_id = $1 AND user_id = $2', [req.params.id, target]);
    return { ok: true };
  });
}
