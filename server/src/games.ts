import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { centralDay } from '../../src/lib/day.ts';
import { agreed, filedOrFakeScore, landslideAnswer, landslidePoints } from '../../src/lib/rules.ts';
import { requireUser } from './auth.ts';
import { setFor, type DaySet } from './content.ts';
import { query } from './db.ts';

const HISTORY_PAGE = 60;
// Items per game in a daily set, for days whose set isn't stored. Landslide is out of 3 points per item.
const SET_SIZE = { 'roll-call': 5, 'filed-or-fake': 8, landslide: 12 } as const;

/** That day's own set, if it holds items for this game (2026-10-23 is Roll Call only), else null. */
function storedSet(set: DaySet | null, day: string, game: keyof typeof SET_SIZE) {
  if (!set || set.day !== day) return null;
  const n = game === 'roll-call' ? set.rollCall.length : game === 'filed-or-fake' ? set.filedOrFake.length : set.landslide.items.length;
  return n ? set : null;
}

type ResultRow = { game: string; score: number | null; detail: Record<string, unknown>; finished_at: string | null };

/** The player's progress on one day's set, in the same shape the app keeps locally. */
export async function progressFor(uid: string, set: DaySet) {
  const votes = await query<{ bill_id: string; vote: 'yea' | 'nay' }>(
    'SELECT bill_id, vote FROM votes WHERE user_id = $1 AND day = $2',
    [uid, set.day],
  );
  const results = await query<ResultRow>(
    'SELECT game, score, detail, finished_at FROM game_results WHERE user_id = $1 AND day = $2',
    [uid, set.day],
  );
  const by = Object.fromEntries(results.map((r) => [r.game, r]));
  const rc = by['roll-call'];
  const fof = by['filed-or-fake'];
  const ls = by['landslide'];
  return {
    rollCall: { votes: Object.fromEntries(votes.map((v) => [v.bill_id, v.vote])), revealed: !!rc?.finished_at },
    rollCallAgreed: rc?.finished_at ? (rc.score ?? 0) : undefined,
    filedOrFake: {
      answers: (fof?.detail.answers as Record<string, boolean>) ?? {},
      done: !!fof?.finished_at,
      score: fof?.score ?? undefined,
    },
    landslide: {
      order: ls?.detail.order as string[] | undefined,
      score: ls?.score ?? undefined,
      done: !!ls?.finished_at,
    },
  };
}

async function finished(uid: string, day: string, game: string) {
  const [row] = await query<{ finished_at: string | null }>(
    'SELECT finished_at FROM game_results WHERE user_id = $1 AND day = $2 AND game = $3',
    [uid, day, game],
  );
  return !!row?.finished_at;
}

/** The set the player is allowed to write to right now: today's (or the latest scheduled). */
async function currentSet(day: string) {
  const set = await setFor(centralDay());
  return set && set.day === day ? set : null;
}

export async function gameRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/today', async (req, reply) => {
    const set = await setFor(centralDay());
    if (!set) return reply.code(404).send({ error: 'No ballots are scheduled yet.' });
    return { ...set, progress: await progressFor(req.uid, set) };
  });

  app.get('/results/today', async (req, reply) => {
    const set = await setFor(centralDay());
    if (!set) return reply.code(404).send({ error: 'No ballots are scheduled yet.' });
    return progressFor(req.uid, set);
  });

  // Every finished game of one kind, newest first, 60 days a page. Text comes from each day's stored set.
  app.get<{ Params: { game: string }; Querystring: { before?: string } }>('/me/history/:game', async (req) => {
    const game = z.enum(['roll-call', 'filed-or-fake', 'landslide']).parse(req.params.game);
    const before = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a YYYY-MM-DD day.').optional().parse(req.query.before);
    const all = await query<{ day: string; score: number | null; detail: Record<string, unknown> }>(
      `SELECT day, score, detail FROM game_results WHERE user_id = $1 AND game = $2 AND finished_at IS NOT NULL ORDER BY day DESC`,
      [req.uid, game],
    );
    const page = all.filter((r) => !before || r.day < before).slice(0, HISTORY_PAGE);

    const days = [];
    for (const r of page) {
      const set = storedSet(await setFor(r.day), r.day, game);
      if (!set) {
        // A score with no stored ballot (sample history from seed-test): show the score alone.
        const empty = game === 'roll-call' ? 'bills' : game === 'filed-or-fake' ? 'captions' : 'items';
        days.push({ day: r.day, score: r.score ?? 0, outOf: SET_SIZE[game], detail: false, [empty]: [] });
        continue;
      }
      if (game === 'roll-call') {
        const votes = await query<{ bill_id: string; vote: 'yea' | 'nay' }>(
          'SELECT bill_id, vote FROM votes WHERE user_id = $1 AND bill_id = ANY($2)',
          [req.uid, set.rollCall.map((b) => b.id)],
        );
        const bills = set.rollCall.flatMap((b) => {
          const v = votes.find((x) => x.bill_id === b.id)?.vote;
          return v ? [{ billId: b.id, number: b.number, title: b.shortTitle, vote: v, agreed: agreed(b, v) }] : [];
        });
        days.push({ day: r.day, score: r.score ?? bills.filter((b) => b.agreed).length, outOf: set.rollCall.length, detail: true, bills });
      } else if (game === 'filed-or-fake') {
        const answers = (r.detail.answers as Record<string, boolean>) ?? {};
        const captions = set.filedOrFake.map((c) => ({
          id: c.id,
          text: c.text,
          real: c.real,
          answeredReal: answers[c.id] ?? null,
          ...(c.real && c.number ? { number: c.number } : {}),
        }));
        days.push({ day: r.day, score: r.score ?? 0, outOf: set.filedOrFake.length, detail: true, captions });
      } else {
        const order = (r.detail.order as string[]) ?? [];
        const answer = landslideAnswer(set.landslide.items);
        const points = landslidePoints(order, answer);
        const items = order.flatMap((id, i) => {
          const it = set.landslide.items.find((x) => x.billId === id);
          return it ? [{ billId: id, number: it.number, title: it.title, yourRank: i + 1, realRank: answer.indexOf(id) + 1, points: points[i] }] : [];
        });
        days.push({ day: r.day, score: r.score ?? 0, outOf: set.landslide.items.length * 3, detail: true, prompt: set.landslide.prompt, items });
      }
    }

    // Summary over every finished game, not only this page. Roll Call is a percentage; the others are points.
    const sets = await Promise.all(all.map(async (r) => ({ r, set: storedSet(await setFor(r.day), r.day, game) })));
    const outOf = ({ set }: { set: DaySet | null }) =>
      !set ? SET_SIZE[game] : game === 'roll-call' ? set.rollCall.length : game === 'filed-or-fake' ? set.filedOrFake.length : set.landslide.items.length * 3;
    const scored = sets.filter((x) => x.r.score !== null && outOf(x) > 0);
    const values = scored.map((x) => (game === 'roll-call' ? (x.r.score! / outOf(x)) * 100 : x.r.score!));
    const round1 = (x: number) => Math.round(x * 10) / 10;
    return {
      game,
      summary: {
        daysPlayed: all.length,
        average: values.length ? round1(values.reduce((a, b) => a + b, 0) / values.length) : null,
        best: values.length ? round1(Math.max(...values)) : null,
        outOf: game === 'roll-call' ? 100 : sets[0] ? outOf(sets[0]) : SET_SIZE[game],
      },
      days,
      nextBefore: all.length > all.indexOf(page[page.length - 1]) + 1 && page.length ? page[page.length - 1].day : null,
    };
  });

  const voteBody = z.object({ day: z.string(), billId: z.string(), vote: z.enum(['yea', 'nay']) });
  app.post('/votes', async (req, reply) => {
    const body = voteBody.parse(req.body);
    const set = await currentSet(body.day);
    if (!set) return reply.code(409).send({ error: "That ballot is closed. Today's is ready." });
    if (!set.rollCall.some((b) => b.id === body.billId)) return reply.code(400).send({ error: 'Not on this ballot.' });
    if (await finished(req.uid, body.day, 'roll-call')) return reply.code(409).send({ error: 'Your Roll Call is already in.' });
    await query(
      `INSERT INTO votes (user_id, bill_id, day, vote) VALUES ($1, $2, $3, $4)
       ON CONFLICT (user_id, bill_id) DO UPDATE SET vote = EXCLUDED.vote, created_at = now()`,
      [req.uid, body.billId, body.day, body.vote],
    );
    return { ok: true };
  });

  // "Vote again" before seeing results.
  app.post('/votes/reset', async (req, reply) => {
    const { day } = z.object({ day: z.string() }).parse(req.body);
    if (await finished(req.uid, day, 'roll-call')) return reply.code(409).send({ error: 'Your Roll Call is already in.' });
    await query('DELETE FROM votes WHERE user_id = $1 AND day = $2', [req.uid, day]);
    return { ok: true };
  });

  const resultBody = z.object({
    day: z.string(),
    answers: z.record(z.string(), z.boolean()).optional(),
    done: z.boolean().optional(),
    order: z.array(z.string()).optional(),
  });

  app.post<{ Params: { game: string } }>('/results/:game', async (req, reply) => {
    const { game } = req.params;
    const body = resultBody.parse(req.body);
    const set = await currentSet(body.day);
    if (!set) return reply.code(409).send({ error: "That ballot is closed. Today's is ready." });
    if (await finished(req.uid, body.day, game)) return { ok: true, alreadyFinished: true };

    let score: number | null = null;
    let detail: Record<string, unknown> = {};
    let done = true;

    if (game === 'roll-call') {
      const votes = await query<{ bill_id: string; vote: 'yea' | 'nay' }>(
        'SELECT bill_id, vote FROM votes WHERE user_id = $1 AND day = $2',
        [req.uid, body.day],
      );
      const byBill = Object.fromEntries(votes.map((v) => [v.bill_id, v.vote]));
      if (!set.rollCall.every((b) => byBill[b.id])) return reply.code(400).send({ error: 'Vote on every bill first.' });
      score = set.rollCall.filter((b) => agreed(b, byBill[b.id])).length;
    } else if (game === 'filed-or-fake') {
      const ids = new Set(set.filedOrFake.map((c) => c.id));
      const answers = Object.fromEntries(Object.entries(body.answers ?? {}).filter(([id]) => ids.has(id)));
      done = !!body.done && set.filedOrFake.every((c) => answers[c.id] !== undefined);
      detail = { answers };
      score = done ? filedOrFakeScore(set.filedOrFake, answers) : null;
    } else if (game === 'landslide') {
      const order = body.order ?? [];
      const expected = set.landslide.items.map((i) => i.billId).sort();
      if ([...order].sort().join() !== expected.join()) return reply.code(400).send({ error: 'Rank all four bills.' });
      score = landslidePoints(order, landslideAnswer(set.landslide.items)).reduce((a, b) => a + b, 0);
      detail = { order };
    } else {
      return reply.code(404).send({ error: 'Unknown game.' });
    }

    await query(
      `INSERT INTO game_results (user_id, day, game, score, detail, finished_at)
       VALUES ($1, $2, $3, $4, $5, CASE WHEN $6 THEN now() END)
       ON CONFLICT (user_id, day, game) DO UPDATE
       SET score = EXCLUDED.score, detail = EXCLUDED.detail, finished_at = EXCLUDED.finished_at`,
      [req.uid, body.day, game, score, JSON.stringify(detail), done],
    );
    return { ok: true, score };
  });
}
