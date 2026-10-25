import type { FastifyInstance } from 'fastify';

import { requireUser } from './auth.ts';
import { query } from './db.ts';
import { lookupZip } from './geo.ts';

type LawmakerRow = {
  id: string;
  body: string;
  name: string;
  title: string;
  party: string | null;
  district: string | null;
  photo_url: string | null;
  photo_credit: string | null;
  recorded: string;
  shared: string;
  agreed: string;
};

/** Every lawmaker matching a seat, with how they compare to this player's votes. */
async function seats(uid: string, where: string, params: unknown[]) {
  return query<LawmakerRow>(
    `SELECT l.id, l.body, l.name, l.title, l.party, l.district, l.photo_url, l.photo_credit,
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

function toRow(l: LawmakerRow, role: string) {
  const shared = Number(l.shared);
  return {
    id: l.id,
    name: l.name,
    role,
    // Party appears only after the player has voted on at least one of this lawmaker's bills.
    party: shared ? l.party : null,
    photo: l.photo_url,
    credit: l.photo_credit,
    recorded: Number(l.recorded),
    shared,
    agreed: Number(l.agreed),
    pct: shared ? Math.round((Number(l.agreed) / shared) * 100) : null,
  };
}

const LABELS: [string, string][] = [
  ['U.S. Senate', 'Senator'],
  ['U.S. House', 'Your rep'],
  ['Texas Senate', 'State senator'],
  ['Texas House', 'State rep'],
  ['Mayor', 'Mayor'],
  ['Austin', 'Council member'],
];

export async function lawmakerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/me/lawmakers', async (req) => {
    const [u] = await query<{ zip: string | null }>('SELECT zip FROM users WHERE id = $1', [req.uid]);
    const loc = u?.zip ? await lookupZip(u.zip) : null;
    if (!loc) return { federal: [], state: [], local: [], byBill: {}, credit: null };
    const d = loc.districts;

    const federal = [
      ...(await seats(req.uid, `l.body = 'us-senate'`, [])).map((l) => toRow(l, 'U.S. Senate, Texas')),
      ...(await seats(req.uid, `l.body = 'us-house' AND l.district = $2`, [d.congress])).map((l) =>
        toRow(l, `U.S. House, Texas District ${l.district}`),
      ),
    ];
    const state = [
      ...(await seats(req.uid, `l.body = 'tx-senate' AND l.district = $2`, [d.stateSenate])).map((l) =>
        toRow(l, `Texas Senate, District ${l.district}`),
      ),
      ...(await seats(req.uid, `l.body = 'tx-house' AND l.district = $2`, [d.stateHouse])).map((l) =>
        toRow(l, `Texas House, District ${l.district}`),
      ),
    ];

    const local: ReturnType<typeof toRow>[] = [];
    if (loc.city === 'Austin') {
      const council = await seats(req.uid, `l.body = 'atx-council'`, []);
      const mayor = council.find((l) => l.district === null);
      const mine = council.find((l) => l.district !== null && l.district === d.council);
      if (mayor) local.push(toRow(mayor, 'Mayor of Austin'));
      if (mine) local.push(toRow(mine, `Austin City Council, District ${mine.district}`));
      // Also the council member you agree with most, when that isn't your own.
      const best = council
        .filter((l) => l.district !== null && Number(l.shared) > 0)
        .sort((a, b) => Number(b.agreed) / Number(b.shared) - Number(a.agreed) / Number(a.shared) || a.name.localeCompare(b.name))[0];
      if (best && best.id !== mine?.id) local.push(toRow(best, `Austin City Council, District ${best.district} (you agree most)`));
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
      const label = LABELS.find(([prefix]) => r.role.startsWith(prefix))?.[1] ?? 'Lawmaker';
      (byBill[v.bill_id] ??= []).push({ name: r.name, label, vote: v.vote });
    }

    const credits = [...new Set(local.map((r) => r.credit && `${r.name}: ${r.credit}`).filter(Boolean))];
    return { federal, state, local, byBill, credit: credits.join(' ') || null };
  });
}
