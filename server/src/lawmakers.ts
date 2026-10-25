import type { FastifyInstance, FastifyRequest } from 'fastify';

import { requireUser } from './auth.ts';
import { query } from './db.ts';
import { stateName, zipSeats } from './geo.ts';

type LawmakerRow = {
  id: string;
  body: string;
  state: string;
  city: string | null;
  name: string;
  title: string;
  party: string | null;
  district: string | null;
  district_key: string | null;
  photo_url: string | null;
  photo_credit: string | null;
  recorded: string;
  shared: string;
  agreed: string;
};

/** Every lawmaker matching a seat, with how they compare to this player's votes. */
async function seats(uid: string, where: string, params: unknown[]) {
  return query<LawmakerRow>(
    `SELECT l.id, l.body, l.state, l.city, l.name, l.title, l.party, l.district, l.district_key, l.photo_url, l.photo_credit,
            count(lv.bill_id) AS recorded,
            count(v.bill_id) AS shared,
            count(v.bill_id) FILTER (WHERE v.vote = lv.vote) AS agreed
     FROM lawmakers l
     LEFT JOIN lawmaker_votes lv ON lv.lawmaker_id = l.id
     LEFT JOIN votes v ON v.bill_id = lv.bill_id AND v.user_id = $1
     WHERE ${where}
     GROUP BY l.id
     ORDER BY l.body, l.name`,
    [uid, ...params],
  );
}

// Photos are stored on this server (server/media/photos), never fetched from elsewhere by the app.
const photoBase = (req: FastifyRequest) => process.env.PUBLIC_URL ?? `${req.protocol}://${req.host}`;

function toRow(l: LawmakerRow, role: string, base: string) {
  const shared = Number(l.shared);
  return {
    id: l.id,
    name: l.name,
    role,
    // Party appears only after the player has voted on at least one of this lawmaker's bills.
    party: shared ? l.party : null,
    photo: l.photo_url && base + l.photo_url,
    credit: l.photo_credit,
    recorded: Number(l.recorded),
    shared,
    agreed: Number(l.agreed),
    pct: shared ? Math.round((Number(l.agreed) / shared) * 100) : null,
  };
}

// What each state calls its legislative chambers, where it isn't "Senate" and "House".
const LOWER: Record<string, string> = {
  CA: 'Assembly', NV: 'Assembly', NY: 'Assembly', WI: 'Assembly', NJ: 'General Assembly',
  MD: 'House of Delegates', VA: 'House of Delegates', WV: 'House of Delegates',
};
const UPPER: Record<string, string> = { NE: 'Legislature', DC: 'Council' };

/** The seat in words: 'U.S. House, Texas District 37', 'California Assembly, District 51', 'Mayor of Austin'. */
function roleOf(l: LawmakerRow) {
  const st = stateName(l.state)!;
  switch (l.body) {
    case 'us-senate':
      return `U.S. Senate, ${st}`;
    case 'us-house':
      if (l.title === 'Delegate') return `U.S. House, ${st} (non-voting delegate)`;
      return l.district_key === '0' ? `U.S. House, ${st} at-large` : `U.S. House, ${st} District ${l.district}`;
    case 'state-upper':
      return l.state === 'DC' ? `D.C. Council, ${l.district}` : `${st} ${UPPER[l.state] ?? 'Senate'}, District ${l.district}`;
    case 'state-lower':
      return `${st} ${LOWER[l.state] ?? 'House'}, District ${l.district}`;
    default:
      return l.district === null ? `Mayor of ${l.city}` : `${l.city} City Council, District ${l.district}`;
  }
}

const LABELS: [RegExp, string][] = [
  [/^U\.S\. Senate/, 'Senator'],
  [/^U\.S\. House/, 'Your rep'],
  [/Senate|Legislature/, 'State senator'],
  [/House|Assembly/, 'State rep'],
  [/^Mayor/, 'Mayor'],
  [/Council/, 'Council member'],
];

export async function lawmakerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/me/lawmakers', async (req) => {
    const [u] = await query<{ zip: string | null }>('SELECT zip FROM users WHERE id = $1', [req.uid]);
    const s = u?.zip ? await zipSeats(u.zip) : null;
    if (!s) return { stateName: null, federal: [], state: [], local: [], byBill: {}, credit: null };
    const st = stateName(s.state)!;
    const base = photoBase(req);
    const row = (l: LawmakerRow, role = roleOf(l)) => toRow(l, role, base);

    const federal = [
      ...(await seats(req.uid, `l.body = 'us-senate' AND l.state = $2`, [s.state])).map((l) => row(l)),
      ...(await seats(req.uid, `l.body = 'us-house' AND l.state = $2 AND l.district_key = $3`, [s.state, s.congress])).map((l) => row(l)),
    ];

    // D.C.'s council sits in the state-upper slot: your ward's member plus the at-large members and the chair.
    const upper = s.state === 'DC'
      ? await seats(req.uid, `l.body = 'state-upper' AND l.state = 'DC' AND (l.district_key = $2 OR l.district_key IN ('atlarge', 'chairman'))`, [s.upper])
      : await seats(req.uid, `l.body = 'state-upper' AND l.state = $2 AND l.district_key = $3`, [s.state, s.upper]);
    const state = [
      ...upper.map((l) => row(l)),
      ...(await seats(req.uid, `l.body = 'state-lower' AND l.state = $2 AND l.district_key = $3`, [s.state, s.lower])).map((l) => row(l)),
    ];

    // City councils we have data for (Austin, for now).
    const local: ReturnType<typeof toRow>[] = [];
    const council = s.city ? await seats(req.uid, `l.body = 'city-council' AND l.state = $2 AND l.city = $3`, [s.state, s.city]) : [];
    if (council.length) {
      const mayor = council.find((l) => l.district === null);
      const mine = council.find((l) => l.district !== null && l.district_key === s.council);
      if (mayor) local.push(row(mayor));
      if (mine) local.push(row(mine));
      // Also the council member you agree with most, when that isn't your own.
      const best = council
        .filter((l) => l.district !== null && Number(l.shared) > 0)
        .sort((a, b) => Number(b.agreed) / Number(b.shared) - Number(a.agreed) / Number(a.shared) || a.name.localeCompare(b.name))[0];
      if (best && best.id !== mine?.id) local.push(row(best, `${roleOf(best)} (you agree most)`));
    }

    // How your own lawmakers voted on each bill, for the Review screen. Public record, so no guards.
    const yours = [...federal, ...state, ...local.filter((r) => !r.role.endsWith('(you agree most)'))];
    const memberVotes = await query<{ lawmaker_id: string; bill_id: string; vote: string }>(
      'SELECT lawmaker_id, bill_id, vote FROM lawmaker_votes WHERE lawmaker_id = ANY($1)',
      [yours.map((r) => r.id)],
    );
    const byBill: Record<string, { name: string; label: string; vote: string }[]> = {};
    for (const v of memberVotes) {
      const r = yours.find((x) => x.id === v.lawmaker_id)!;
      const label = LABELS.find(([re]) => re.test(r.role))?.[1] ?? 'Lawmaker';
      (byBill[v.bill_id] ??= []).push({ name: r.name, label, vote: v.vote });
    }

    const credits = [...new Set(local.map((r) => r.credit && `${r.name}: ${r.credit}`).filter(Boolean))];
    return { stateName: st, federal, state, local, byBill, credit: credits.join(' ') || null };
  });

  // One lawmaker, anywhere in the country: seat, sourced background and links, and every recorded vote.
  app.get<{ Params: { id: string } }>('/lawmakers/:id', async (req, reply) => {
    const [l] = await seats(req.uid, 'l.id = $2', [req.params.id]);
    if (!l) return reply.code(404).send({ error: 'No such lawmaker.' });
    const r = toRow(l, roleOf(l), photoBase(req));
    const [p] = await query<{ in_office_since: string | null; background: unknown; committees: unknown; links: unknown[] }>(
      'SELECT in_office_since, background, committees, links FROM lawmaker_profiles WHERE lawmaker_id = $1',
      [l.id],
    );
    const votes = await query<{ billId: string; vote: string; sourceUrl: string }>(
      'SELECT bill_id AS "billId", vote, source_url AS "sourceUrl" FROM lawmaker_votes WHERE lawmaker_id = $1 ORDER BY bill_id',
      [l.id],
    );
    return {
      id: r.id,
      name: r.name,
      title: l.title,
      role: r.role,
      state: l.state,
      stateName: stateName(l.state),
      district: l.district,
      party: r.party,
      photo: r.photo,
      photoCredit: r.credit,
      inOfficeSince: p?.in_office_since ?? null,
      background: p?.background ?? null,
      // No public source lists every lawmaker's campaign platform without an API key, so this stays empty.
      priorities: null,
      committees: p?.committees ?? null,
      links: p?.links ?? [],
      votes,
      agreement: { pct: r.pct, agreed: r.agreed, shared: r.shared },
    };
  });
}
