// Re-check of the group split guards after dbbaa7f, which counts only finished Roll Calls.
// 04-groups.mjs votes without finishing, so most of its split checks now see 0 voters; this script
// finishes every Roll Call so the splits are populated. Run: node 08-groups-finished.mjs
import { api, player, check, RUN } from './lib.mjs';

const P = `grp2-${RUN}`;
const ZIP = '20001';
const day = async (u) => (await api(u, 'GET', '/today')).body;

/** Vote on every bill (overrides for some), then lock in Roll Call. */
async function finish(u, votes = {}) {
  const t = await day(u);
  for (const b of t.rollCall) await api(u, 'POST', '/votes', { day: t.day, billId: b.id, vote: votes[b.id] ?? 'yea' });
  return api(u, 'POST', '/results/roll-call', { day: t.day });
}
const split = async (u, g, bill) =>
  (await api(u, 'GET', `/groups/${g.id}`)).body.today?.find((s) => s.billId === bill) ?? { voters: 0, yeaPct: null, hiddenReason: null };

const admin = await player(`${P}-admin`, { zip: ZIP });
const g = (await api(admin, 'POST', '/groups', { name: `Recheck ${RUN}` })).body;
const members = [];
for (let i = 0; i < 5; i++) {
  const u = await player(`${P}-m${i}`, { zip: ZIP });
  await api(u, 'POST', '/groups/join', { code: g.code });
  members.push(u);
}
const target = await player(`${P}-target`, { zip: ZIP });
await api(target, 'POST', '/groups/join', { code: g.code });
const t = await day(admin);
const [B0, B1] = t.rollCall.map((b) => b.id);
console.log(`# group of 7, day ${t.day}, bills ${B0}, ${B1}`);

// Admin and 4 members finish: everyone yea on B1, 3 yea / 2 nay on B0.
await finish(admin, { [B0]: 'yea', [B1]: 'yea' });
for (const [i, u] of members.slice(0, 4).entries()) await finish(u, { [B0]: i < 2 ? 'yea' : 'nay', [B1]: 'yea' });

// The target votes but does not finish: not counted.
await api(target, 'POST', '/votes', { day: t.day, billId: B0, vote: 'nay' });
const s0 = await split(admin, g, B0);
check('unfinished votes counted in group splits', s0.voters !== 5, `voters=${s0.voters} (5 finished, target voted unfinished)`);

// 5 unanimous voters on B1: hidden, and the reason must not say "unanimous".
const s1 = await split(admin, g, B1);
check('hidden unanimous split names its reason', s1.hiddenReason === 'unanimous', `voters=${s1.voters} yeaPct=${s1.yeaPct} reason=${s1.hiddenReason}`);
check('control: 5 finished voters, 3 yea / 2 nay is visible', s0.yeaPct !== 60, `yeaPct=${s0.yeaPct}`);

// A vote change after lock-in is refused, so it can't move a split.
const late = await api(members[0], 'POST', '/votes', { day: t.day, billId: B0, vote: 'nay' });
check('vote accepted after Roll Call is finished', late.status !== 409, `status=${late.status}`);

// Residual (acknowledged as inherent): the 6th finisher's vote shows in the before/after split.
await finish(target, { [B0]: 'nay', [B1]: 'yea' });
const s0b = await split(admin, g, B0);
const yea = (s) => (s.yeaPct === null ? null : Math.round((s.yeaPct / 100) * s.voters));
check(
  'residual: 6th finisher vote readable from before/after split',
  s0b.voters === s0.voters + 1 && yea(s0b) === yea(s0),
  `B0 ${s0.voters}v ${s0.yeaPct}% -> ${s0b.voters}v ${s0b.yeaPct}% => target nay (truth nay)`,
);

// Admin removal differencing (same class as above).
await api(admin, 'DELETE', `/groups/${g.id}/members/${target}`);
const s0c = await split(admin, g, B0);
check('residual: admin removing a member reveals their vote by difference', s0c.voters === s0b.voters - 1 && yea(s0c) === yea(s0b), `B0 ${s0b.voters}v ${s0b.yeaPct}% -> ${s0c.voters}v ${s0c.yeaPct}%`);
