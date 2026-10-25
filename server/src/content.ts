import type { Bill, Caption, LandslideItem } from '../../src/data/types.ts';
import { query } from './db.ts';

export type BillRow = {
  id: string;
  level: Bill['level'];
  jurisdiction: string;
  number: string;
  origin: string;
  title: string;
  short_title: string;
  summary: string;
  topic: Bill['topic'];
  chamber_votes: Bill['chamberVotes'];
  passed: boolean;
  outcome: string;
  source_url: string;
};

export function toBill(r: BillRow): Bill {
  return {
    id: r.id,
    level: r.level,
    jurisdiction: r.jurisdiction,
    number: r.number,
    origin: r.origin,
    title: r.title,
    shortTitle: r.short_title,
    summary: r.summary,
    topic: r.topic,
    chamberVotes: r.chamber_votes,
    passed: r.passed,
    outcome: r.outcome,
    sourceUrl: r.source_url,
  };
}

export type DaySet = {
  day: string;
  rollCall: Bill[];
  filedOrFake: Caption[];
  landslide: { prompt: string; items: LandslideItem[] };
};

/** The set for a Central-time day, or the latest scheduled set before it. */
export async function setFor(day: string): Promise<DaySet | null> {
  const [pick] = await query<{ day: string }>(
    `SELECT day FROM daily_sets WHERE day <= $1 GROUP BY day ORDER BY day DESC LIMIT 1`,
    [day],
  );
  if (!pick) return null;
  const rows = await query<{ game: string; payload: unknown } & Partial<BillRow>>(
    `SELECT s.game, s.payload, b.* FROM daily_sets s LEFT JOIN bills b ON b.id = s.bill_id
     WHERE s.day = $1 ORDER BY s.game, s.position`,
    [pick.day],
  );
  const items = rows.filter((r) => r.game === 'landslide').map((r) => r.payload as LandslideItem & { prompt: string });
  return {
    day: pick.day,
    rollCall: rows.filter((r) => r.game === 'roll-call').map((r) => toBill(r as BillRow)),
    filedOrFake: rows.filter((r) => r.game === 'filed-or-fake').map((r) => r.payload as Caption),
    landslide: {
      prompt: items[0]?.prompt ?? '',
      items: items.map(({ prompt: _prompt, ...it }) => it),
    },
  };
}
