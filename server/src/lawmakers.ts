import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';

import { requireUser } from './auth.ts';
import { query } from './db.ts';

// Built by scripts/fetch_lawmakers.py from Voteview and the City of Austin's council votes.
type MemberVote = {
  billId: string;
  body: 'us-senate' | 'us-house' | 'atx-council';
  memberId: string;
  name: string;
  title?: string | null;
  party: 'D' | 'R' | 'I' | null;
  district: string | null;
  vote: 'yea' | 'nay';
};

const VOTES: MemberVote[] = JSON.parse(readFileSync(join(import.meta.dirname, '..', 'data', 'lawmaker-votes.json'), 'utf8'));

/** "DOGGETT, Lloyd Alton, II" -> "Lloyd Doggett"; "CRUZ, Rafael Edward (Ted)" -> "Ted Cruz". */
function displayName(raw: string) {
  if (!raw.includes(',')) return raw;
  const [last, rest] = raw.split(',').map((s) => s.trim());
  const nick = rest.match(/\(([^)]+)\)/)?.[1];
  const first = nick ?? rest.split(/\s+/)[0];
  const title = (s: string) => s.toLowerCase().replace(/(^|[\s'-])\p{L}/gu, (c) => c.toUpperCase());
  return `${first} ${title(last)}`;
}

type Row = { name: string; role: string; party: string | null; agreed: number; shared: number; pct: number | null; photo?: string | null };

// Official portraits. Congress: public-domain member photos keyed by Bioguide ID (unitedstates/images).
// Austin: headshots from each council member's page on austintexas.gov. District 4's page doesn't name
// its member, so Chito Vela has no photo. Mayor Watson's is from Wikimedia Commons (CC BY-SA 4.0).
const congressPhoto = (bioguide: string) => `https://unitedstates.github.io/images/congress/225x275/${bioguide}.jpg`;
const W = 'https://austin.widen.net/content';
const AUSTIN_PHOTOS: Record<string, string> = {
  'Kirk Watson':
    'https://upload.wikimedia.org/wikipedia/commons/thumb/1/13/Watson_Groundbreaking_5.3.23_%28cropped%29.jpg/330px-Watson_Groundbreaking_5.3.23_%28cropped%29.jpg',
  'Natasha Harper-Madison': `${W}/6ownj6z5sv/web/Austin%20District%201%20-%20Web_D1-Headshot.jpg?w=240`,
  'Vanessa Fuentes': `${W}/w8eqbih8y4/web/Austin%20District%202%20-%20Web_Vanessa-profiledetail.jpg?w=240`,
  'José Velásquez': `${W}/joekrymskc/web/Austin%20District%203%20-%20Web_jose-velasquez-profiledetail-opt.jpg?w=240`,
  'Ryan Alter': `${W}/ewbmwfdwyj/web/Alter_Ryan_bio.jpg?w=240`,
  'Krista Laine': `${W}/r26pgbz6kn/web/Austin%20District%206%20-%20Web_krista-headshot-opt.jpg?w=240`,
  'Mike Siegel': `${W}/bf26jpttmp/web/Austin%20District%207%20-%20Web_D7-profiledetail-opt.jpg?w=240`,
  'Paige Ellis': `${W}/ldixhspulc/web/Austin%20District%208%20-%20Web_PJE-profiledetail-opt.png?w=240`,
  'Zohaib "Zo" Qadri': `${W}/yajrku9cxq/web/Austin%20District%209%20-%20Web_zo-profile-opt.jpg?w=240`,
  'Marc Duchen': `${W}/opfnakk2tl/web/Austin%20District%2010%20-%20Web_Marc_HollyReed_1_656x584.jpg?w=240`,
};
export const PHOTO_CREDIT = 'Kirk Watson photo by EmmaAtx, CC BY-SA 4.0, via Wikimedia Commons';

function photoFor(v: MemberVote) {
  if (v.body === 'atx-council') return AUSTIN_PHOTOS[v.memberId] ?? null;
  return /^[A-Z]\d{6}$/.test(v.memberId) ? congressPhoto(v.memberId) : null;
}

function compare(memberVotes: MemberVote[], mine: Map<string, string>): Omit<Row, 'name' | 'role'> {
  const both = memberVotes.filter((v) => mine.has(v.billId));
  const agreed = both.filter((v) => mine.get(v.billId) === v.vote).length;
  return {
    // Party appears only after the player has voted on at least one of this lawmaker's bills.
    party: both.length ? memberVotes[0].party : null,
    agreed,
    shared: both.length,
    pct: both.length ? Math.round((agreed / both.length) * 100) : null,
  };
}

const byMember = (body: MemberVote['body']) => {
  const map = new Map<string, MemberVote[]>();
  for (const v of VOTES) if (v.body === body) map.set(v.memberId, [...(map.get(v.memberId) ?? []), v]);
  return map;
};

export async function lawmakerRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireUser);

  app.get('/me/lawmakers', async (req) => {
    const [u] = await query<{ state: string | null; city: string | null; districts: { congress?: string | null } | null }>(
      'SELECT state, city, districts FROM users WHERE id = $1',
      [req.uid],
    );
    const mine = new Map(
      (await query<{ bill_id: string; vote: string }>('SELECT bill_id, vote FROM votes WHERE user_id = $1', [req.uid])).map((v) => [
        v.bill_id,
        v.vote,
      ]),
    );

    // Member-level votes are loaded for Texas's delegation and Austin's council only.
    const federal: Row[] = [];
    if (u?.state === 'TX') {
      for (const votes of byMember('us-senate').values()) {
        federal.push({ name: displayName(votes[0].name), role: 'U.S. Senate, Texas', photo: photoFor(votes[0]), ...compare(votes, mine) });
      }
      const district = u.districts?.congress;
      const rep = [...byMember('us-house').values()].find((v) => v[0].district === district);
      if (rep) federal.push({ name: displayName(rep[0].name), role: `U.S. House, Texas District ${district}`, photo: photoFor(rep[0]), ...compare(rep, mine) });
    }

    const local: Row[] = [];
    if (u?.city === 'Austin') {
      const members = [...byMember('atx-council').values()];
      const mayor = members.find((v) => v[0].title === 'Mayor');
      if (mayor) local.push({ name: mayor[0].name, role: 'Mayor of Austin', photo: photoFor(mayor[0]), ...compare(mayor, mine) });
      // City council districts aren't in the Census data, so show the member you agree with most.
      const best = members
        .filter((v) => v[0].title !== 'Mayor')
        .map((v) => ({ v, c: compare(v, mine) }))
        .sort((a, b) => (b.c.pct ?? -1) - (a.c.pct ?? -1) || a.v[0].name.localeCompare(b.v[0].name))[0];
      if (best) {
        local.push({
          name: best.v[0].name,
          role: `Austin City Council, District ${best.v[0].district} (you agree most)`,
          photo: photoFor(best.v[0]),
          ...best.c,
        });
      }
    }
    // How your own lawmakers voted on each bill, for the Review screen. Public record, so no guards.
    const yours = new Map<string, string>(); // memberId -> role label
    if (u?.state === 'TX') {
      for (const v of VOTES) if (v.body === 'us-senate') yours.set(v.memberId, 'Senator');
      for (const v of VOTES) if (v.body === 'us-house' && v.district === u.districts?.congress) yours.set(v.memberId, 'Your rep');
    }
    if (u?.city === 'Austin') for (const v of VOTES) if (v.body === 'atx-council' && v.title === 'Mayor') yours.set(v.memberId, 'Mayor');
    const byBill: Record<string, { name: string; label: string; vote: string }[]> = {};
    for (const v of VOTES) {
      const label = yours.get(v.memberId);
      if (label) (byBill[v.billId] ??= []).push({ name: displayName(v.name), label, vote: v.vote });
    }
    return { federal, local, state: [], byBill, credit: local.some((r) => r.name === 'Kirk Watson') ? PHOTO_CREDIT : null };
  });
}
