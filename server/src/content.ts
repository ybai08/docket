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

/** Where a player is, for picking their state's and city's items. */
export type Place = { state: string | null; city: string | null };

/**
 * The set for a Central-time day, or the latest scheduled set before it. With a place, it is that
 * player's set: Roll Call adds their state's and city's bills to everyone's; Filed or Fake and Landslide
 * come from the most specific scope that has them. Without one, only everyone's items.
 */
export async function setFor(day: string, place?: Place): Promise<DaySet | null> {
  const [pick] = await query<{ day: string }>(
    `SELECT day FROM daily_sets WHERE day <= $1 GROUP BY day ORDER BY day DESC LIMIT 1`,
    [day],
  );
  if (!pick) return null;
  // Most specific first.
  const scopes = [place?.state && place.city ? `${place.state}/${place.city}` : null, place?.state ?? null, ''].filter(
    (x): x is string => x !== null,
  );
  const rows = await query<{ game: string; scope: string; position: number; payload: unknown } & Partial<BillRow>>(
    `SELECT s.game, s.scope, s.position, s.payload, b.* FROM daily_sets s LEFT JOIN bills b ON b.id = s.bill_id
     WHERE s.day = $1 AND s.scope = ANY($2) ORDER BY s.game, s.position`,
    [pick.day, scopes],
  );
  const rank = (scope: string) => scopes.indexOf(scope);
  const rollCall = rows
    .filter((r) => r.game === 'roll-call')
    .sort((a, b) => a.position - b.position || rank(a.scope) - rank(b.scope))
    .map((r) => toBill(r as BillRow));
  const nearest = (game: string) => {
    const mine = rows.filter((r) => r.game === game);
    const scope = scopes.find((sc) => mine.some((r) => r.scope === sc));
    return mine.filter((r) => r.scope === scope);
  };
  const items = nearest('landslide').map((r) => r.payload as LandslideItem & { prompt: string });
  return {
    day: pick.day,
    rollCall,
    filedOrFake: nearest('filed-or-fake').map((r) => r.payload as Caption),
    landslide: {
      prompt: items[0]?.prompt ?? '',
      items: items.map(({ prompt: _prompt, ...it }) => it),
    },
  };
}

export async function placeOf(uid: string): Promise<Place> {
  const [u] = await query<Place>('SELECT state, city FROM users WHERE id = $1', [uid]);
  return { state: u?.state ?? null, city: u?.city ?? null };
}

/** The player's own set for a day. */
export async function setForUser(uid: string, day: string) {
  return setFor(day, await placeOf(uid));
}
