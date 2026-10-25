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

type Row = { name: string; role: string; party: string | null; agreed: number; shared: number; pct: number | null };

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
        federal.push({ name: displayName(votes[0].name), role: 'U.S. Senate, Texas', ...compare(votes, mine) });
      }
      const district = u.districts?.congress;
      const rep = [...byMember('us-house').values()].find((v) => v[0].district === district);
      if (rep) federal.push({ name: displayName(rep[0].name), role: `U.S. House, Texas District ${district}`, ...compare(rep, mine) });
    }

    const local: Row[] = [];
    if (u?.city === 'Austin') {
      const members = [...byMember('atx-council').values()];
      const mayor = members.find((v) => v[0].title === 'Mayor');
      if (mayor) local.push({ name: mayor[0].name, role: 'Mayor of Austin', ...compare(mayor, mine) });
      // City council districts aren't in the Census data, so show the member you agree with most.
      const best = members
        .filter((v) => v[0].title !== 'Mayor')
        .map((v) => ({ v, c: compare(v, mine) }))
        .sort((a, b) => (b.c.pct ?? -1) - (a.c.pct ?? -1) || a.v[0].name.localeCompare(b.v[0].name))[0];
      if (best) {
        local.push({
          name: best.v[0].name,
          role: `Austin City Council, District ${best.v[0].district} (you agree most)`,
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
    return { federal, local, state: [], byBill };
  });
}
