// QA persona: the mover (changes ZIP/state mid-day), account deleter, history/lawmaker checker.
// Run from server/qa:  node 07-mover.mjs     (API on :8799 must be running; Docker DB docket-qa-pg)
//
// Midnight section (G/H) starts its OWN second API instance on :8798 with a Date shim (clock read from a
// file) so it can cross 2026-10-25 -> 2026-10-26 Central. For H it temporarily inserts daily_sets rows for
// 2026-10-26 (a copy of 2026-10-25's) into the LOCAL QA db and deletes them again in `finally`.
// Set SKIP_MIDNIGHT=1 to skip G/H. Needs QA_ENV (defaults to start-local.sh's qa.env) and REGISTER (stub-auth loader).
import { spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { api, player, sql, check, RUN } from './lib.mjs';

const P = `move-${RUN}`;
const J = (x) => JSON.stringify(x);
const SCRATCH = process.env.QA_TMP ?? `${(process.env.TMPDIR ?? '/tmp').replace(/\/$/, '')}/docket-qa`; // written by start-local.sh
const bug = (label, isBug, extra) => check(label, !!isBug, extra);
const sortByMargin = (items) => [...items].sort((a, b) => (b.yeas - b.nays) - (a.yeas - a.nays)).map((i) => i.billId);
const today = async (u) => (await api(u, 'GET', '/today')).body;
const vote = (u, day, billId, v = 'yea') => api(u, 'POST', '/votes', { day, billId, vote: v });
const move = (u, zip) => api(u, 'POST', '/me/location', { zip });
const hist = async (u, g) => (await api(u, 'GET', `/me/history/${g}`)).body;

// ---------------------------------------------------------------- A. per-ZIP daily sets
console.log('--- A. per-ZIP sets');
const zips = { austin: '78705', houston: '77002', ca: '90210', nh: '03301', dc: '20001', none: null };
const T = {};
for (const [k, zip] of Object.entries(zips)) {
  const u = `${P}-a-${k}`;
  await player(u, { zip });
  T[k] = await today(u);
  const t = T[k];
  console.log(`info ${k} ${zip} day=${t.day} RC=${t.rollCall.length}[${t.rollCall.map((b) => b.id).join(',')}] FoF=${t.filedOrFake.length}(${t.filedOrFake[0]?.id}) LS=${t.landslide.items.length}(${t.landslide.items[0]?.billId})`);
}
const day = T.austin.day;
bug('A1 Austin Roll Call = 5 with national + Texas + Austin bills',
  !(T.austin.rollCall.length === 5 && T.austin.rollCall.some((b) => b.id.startsWith('us-')) && T.austin.rollCall.some((b) => b.id.startsWith('tx-')) && T.austin.rollCall.some((b) => b.id.startsWith('atx-'))),
  `ids=${T.austin.rollCall.map((b) => b.id)}`);
bug('A2 every ZIP gets a 5-bill Roll Call (Houston has no city bills)', Object.entries(T).some(([k, t]) => k !== 'none' && t.rollCall.length !== 5),
  Object.entries(T).map(([k, t]) => `${k}=${t.rollCall.length}`).join(' '));
bug('A3 DC has its own Landslide (no DC landslide rows seeded -> DC player gets the national set of Texas bills)', T.dc.landslide.items.some((i) => i.billId.startsWith('tx-')),
  `DC landslide ids=${T.dc.landslide.items.map((i) => i.billId)}`);
bug('A4 no-ZIP player gets only national Roll Call (2 bills, not 5) and Texas-bill Landslide',
  T.none.rollCall.length < 5 || T.none.landslide.items.some((i) => i.billId.startsWith('tx-')),
  `RC=${T.none.rollCall.length} LS=${T.none.landslide.items.map((i) => i.billId)}`);
bug('A5 Texas (state with no TX filed/landslide scope) players share the national FoF/LS with no-ZIP and DC', J(T.austin.filedOrFake.map((c) => c.id)) === J(T.none.filedOrFake.map((c) => c.id)),
  `austin FoF == none FoF`);
bug('A6 /today ships the answers before play (FoF `real`, Landslide yeas/nays)',
  T.austin.filedOrFake.every((c) => typeof c.real === 'boolean') && T.austin.landslide.items.every((i) => typeof i.yeas === 'number'),
  'perfect FoF/Landslide is computable from GET /today alone');
{
  const u = `${P}-a-bad`;
  await player(u);
  const r = await Promise.all([move(u, '00000'), move(u, '1234'), move(u, 'abcde'), api(u, 'GET', '/geo/00000'), api(u, 'GET', '/geo/78705')]);
  bug('A7 invalid ZIP: 404 for unknown, 400 for malformed, profile unchanged', !(r[0].status === 404 && r[1].status === 400 && r[2].status === 400 && r[3].status === 404 && r[4].status === 200),
    r.map((x) => x.status).join(','));
  const me = (await api(u, 'GET', '/me')).body.profile;
  bug('A8 failed ZIP save leaves profile with no place', me.zip !== null || me.state !== null, J([me.zip, me.state]));
  const t = await today(u);
  bug('A9 /today works for a brand-new user with no ZIP (national only)', t.rollCall.length !== 2, `RC=${t.rollCall.length}`);
}

// ---------------------------------------------------------------- B. move mid Roll Call
console.log('--- B. move mid-game (Roll Call)');
{
  const u = `${P}-b1`;
  await player(u, { zip: '78705' });
  let t = await today(u);
  const tx = t.rollCall.filter((b) => /^a?tx-/.test(b.id));
  for (const b of tx) await vote(u, day, b.id, 'yea');
  await move(u, '90210');
  t = await today(u);
  const caIds = new Set(t.rollCall.map((b) => b.id));
  const foreign = Object.keys(t.progress.rollCall.votes).filter((id) => !caIds.has(id));
  bug('B1 after move, /today progress still lists votes on bills not on the new ballot', foreign.length > 0, `foreign=${foreign}`);
  const early = await api(u, 'POST', '/results/roll-call', { day });
  bug('B2 cannot finish Roll Call on new ballot with only old-state votes', early.status !== 400, J(early));
  for (const b of t.rollCall) await vote(u, day, b.id, 'nay');
  const fin = await api(u, 'POST', '/results/roll-call', { day });
  bug('B3 can finish the new (CA) ballot after the move', fin.status !== 200, J(fin.body));
  const n = Number(sql(`select count(*) from votes where user_id='${u}'`));
  bug('B4 one day ends up with more votes than the ballot has (3 TX + 5 CA = 8)', n > 5, `votes in DB=${n}`);
  const hCA = (await hist(u, 'roll-call')).days[0];
  await move(u, '78705');
  const hTX = (await hist(u, 'roll-call')).days[0];
  console.log(`info history CA: score=${hCA.score}/${hCA.outOf} bills=${hCA.bills.map((x) => x.billId + ':' + x.agreed)}`);
  console.log(`info history TX: score=${hTX.score}/${hTX.outOf} bills=${hTX.bills.map((x) => x.billId + ':' + x.agreed)}`);
  const agreedTX = hTX.bills.filter((x) => x.agreed).length;
  bug('B5 same finished day renders different bills per current ZIP (history rewrites itself when you move)', J(hCA.bills.map((x) => x.billId)) !== J(hTX.bills.map((x) => x.billId)), 'CA vs TX bill lists differ');
  bug('B6 history score disagrees with the bills shown for that day', hTX.score !== agreedTX || hCA.score !== hCA.bills.filter((x) => x.agreed).length,
    `TX view score=${hTX.score} but ${agreedTX} bills agreed`);
  const late = await vote(u, day, 'tx-89r-sb6', 'nay');
  bug('B7 after finishing, voting on an old-state bill is refused (409)', late.status !== 409, J(late));
  const me = (await api(u, 'GET', '/me')).body.stats;
  bug('B8 stats count 8 bills for a 5-bill Roll Call (billsVoted/agreement include off-ballot votes)', me.billsVoted !== 5, `billsVoted=${me.billsVoted} rollCallsPlayed=${me.rollCallsPlayed} agreementPct=${me.agreementPct}`);
}
{
  // finish in TX with all 5, then move to CA: new ballot has 3 CA bills nobody can vote on
  const u = `${P}-b2`;
  await player(u, { zip: '78705' });
  let t = await today(u);
  for (const b of t.rollCall) await vote(u, day, b.id, 'yea');
  const fin = await api(u, 'POST', '/results/roll-call', { day });
  await move(u, '90210');
  t = await today(u);
  const caVote = await vote(u, day, t.rollCall.find((b) => b.id.startsWith('ca-')).id, 'yea');
  bug('B9 finished Roll Call in TX, moved to CA: CA bills are locked (409), progress says revealed with 0 CA votes', caVote.status === 409 && t.progress.rollCall.revealed,
    `finish=${J(fin.body)} caVote=${caVote.status} votesOnCABallot=${t.rollCall.filter((b) => t.progress.rollCall.votes[b.id]).length}/5`);
  const h = (await hist(u, 'roll-call')).days[0];
  bug('B10 history day shows fewer bills than outOf (3 of 5 votes missing) after the move', h.bills.length < h.outOf, `bills=${h.bills.length} outOf=${h.outOf} score=${h.score}`);
}

// ---------------------------------------------------------------- C. move mid FoF / Landslide
console.log('--- C. move mid-game (Filed or Fake / Landslide)');
{
  const u = `${P}-c1`;
  await player(u, { zip: '78705' });
  let t = await today(u);
  const fof = await api(u, 'POST', '/results/filed-or-fake', { day, answers: Object.fromEntries(t.filedOrFake.map((c) => [c.id, c.real])), done: true });
  const lsOrder = sortByMargin(t.landslide.items);
  const ls = await api(u, 'POST', '/results/landslide', { day, order: lsOrder });
  console.log(`info TX scope: FoF ${J(fof.body)} LS ${J(ls.body)} (answers read from GET /today)`);
  await move(u, '90210');
  t = await today(u);
  const caCapIds = new Set(t.filedOrFake.map((c) => c.id));
  const foreignAns = Object.keys(t.progress.filedOrFake.answers).filter((id) => !caCapIds.has(id));
  bug('C1 after move, FoF progress says done with score but its answers are for another ballot', t.progress.filedOrFake.done && foreignAns.length > 0, `done=${t.progress.filedOrFake.done} score=${t.progress.filedOrFake.score} foreignAnswers=${foreignAns.length}/8`);
  bug('C2 after move, Landslide progress says done with an order of bills not on the new ballot', t.progress.landslide.done && t.progress.landslide.order.some((id) => !t.landslide.items.some((i) => i.billId === id)), J(t.progress.landslide));
  const fof2 = await api(u, 'POST', '/results/filed-or-fake', { day, answers: Object.fromEntries(t.filedOrFake.map((c) => [c.id, c.real])), done: true });
  const ls2 = await api(u, 'POST', '/results/landslide', { day, order: sortByMargin(t.landslide.items) });
  bug('C3 moving does NOT allow a second FoF / Landslide play (alreadyFinished)', !(fof2.body.alreadyFinished && ls2.body.alreadyFinished), J([fof2.body, ls2.body]));
  const hf = (await hist(u, 'filed-or-fake')).days[0];
  const hl = (await hist(u, 'landslide')).days[0];
  bug('C4 FoF history after move: score shown but every caption answeredReal = null (captions from the new ballot)', hf.score > 0 && hf.captions.every((c) => c.answeredReal === null), `score=${hf.score}/${hf.outOf} answered=${hf.captions.filter((c) => c.answeredReal !== null).length}/8`);
  bug('C5 Landslide history after move: score shown but 0 ranked items listed', hl.score > 0 && hl.items.length === 0, `score=${hl.score}/${hl.outOf} items=${hl.items.length}`);
  const rank0 = [...(hl.items ?? [])].some((i) => i.realRank < 1);
  bug('C6 Landslide history realRank never < 1', rank0, 'items with realRank 0');
  const st = (await api(u, 'GET', '/me')).body.stats.byGame;
  console.log(`info stats byGame after move: ${J(st)}`);
}
{
  // partial FoF in national set, move to NH, finish there
  const u = `${P}-c2`;
  await player(u, { zip: '78705' });
  let t = await today(u);
  await api(u, 'POST', '/results/filed-or-fake', { day, answers: Object.fromEntries(t.filedOrFake.slice(0, 4).map((c) => [c.id, c.real])), done: false });
  await move(u, '03301');
  t = await today(u);
  const foreign = Object.keys(t.progress.filedOrFake.answers);
  bug('C7 partial FoF answers from old ballot show up on the new ballot progress', foreign.length > 0, `answers=${foreign}`);
  const fin = await api(u, 'POST', '/results/filed-or-fake', { day, answers: Object.fromEntries(t.filedOrFake.map((c) => [c.id, c.real])), done: true });
  const det = JSON.parse(sql(`select detail::text from game_results where user_id='${u}' and game='filed-or-fake'`));
  bug('C8 finishing the new ballot discards the old partial answers (only new ids stored)', Object.keys(det.answers).some((id) => foreign.includes(id)), `finish=${J(fin.body)} stored=${Object.keys(det.answers).length} ids`);
}
{
  // ballot-closed checks: other days
  const u = `${P}-c3`;
  await player(u, { zip: '78705' });
  const t = await today(u);
  const r = await Promise.all([vote(u, '2026-10-24', t.rollCall[0].id), vote(u, '2026-10-26', t.rollCall[0].id), vote(u, 'garbage', t.rollCall[0].id), api(u, 'POST', '/results/landslide', { day: '2026-10-24', order: t.landslide.items.map((i) => i.billId) })]);
  bug('C9 votes/results for other days are refused (4xx)', r.some((x) => x.status < 400 || x.status >= 500), r.map((x) => x.status).join(','));
  const bad = await api(u, 'POST', '/results/landslide', { day, order: [...t.landslide.items.map((i) => i.billId).slice(0, 3), 'tx-89r-hb2'] });
  bug('C10 Landslide with a foreign bill id is refused (400)', bad.status !== 400, J(bad));
  const dup = await api(u, 'POST', '/results/landslide', { day, order: Array(4).fill(t.landslide.items[0].billId) });
  bug('C11 Landslide with duplicated ids is refused (400)', dup.status !== 400, J(dup));
  const g = await api(u, 'POST', '/results/bogus', { day });
  bug('C12 unknown game -> 4xx', g.status < 400 || g.status >= 500, J(g));
}

// ---------------------------------------------------------------- D. area boards after a move
console.log('--- D. area board with a mover (NH)');
{
  const nh = [];
  for (let i = 0; i < 5; i++) {
    const u = `${P}-d-nh${i}`;
    await player(u, { zip: '03301' });
    const t = await today(u);
    for (const b of t.rollCall) await vote(u, day, b.id, 'yea');
    await api(u, 'POST', '/results/roll-call', { day });
    await api(u, 'POST', '/results/filed-or-fake', { day, answers: Object.fromEntries(t.filedOrFake.map((c) => [c.id, !c.real])), done: true });
    nh.push(u);
  }
  const m = `${P}-d-mover`;
  await player(m, { zip: '78705' });
  const t = await today(m);
  for (const b of t.rollCall) await vote(m, day, b.id, 'yea');
  await api(m, 'POST', '/results/roll-call', { day });
  await api(m, 'POST', '/results/filed-or-fake', { day, answers: Object.fromEntries(t.filedOrFake.map((c) => [c.id, c.real])), done: true });
  const before = (await api(nh[0], 'GET', '/leaderboard/area/state')).body;
  await move(m, '03301');
  const after = (await api(nh[0], 'GET', '/leaderboard/area/state')).body;
  console.log(`info NH area players before=${before.players} after mover=${after.players} keys=${Object.keys(after)}`);
  bug('D1 a player who played the TX ballot is counted in NH area stats after moving (and in TX before)', after.players > before.players, `players ${before.players} -> ${after.players}; FoF mean ${J(before.filedOrFake ?? before.games)} -> ${J(after.filedOrFake ?? after.games)}`);
  const own = (await api(m, 'GET', '/leaderboard/area/state')).body;
  console.log(`info mover's own NH area view: ${J(own).slice(0, 300)}`);
}

// ---------------------------------------------------------------- E. DELETE /me
console.log('--- E. delete account');
{
  const a = `${P}-e-admin`, b = `${P}-e-m1`, c = `${P}-e-m2`, f = `${P}-e-friend`;
  await player(a, { zip: '03301', username: `mv${RUN.slice(-6)}a`, displayName: 'Admin' });
  await player(b, { zip: '03301' });
  await player(c, { zip: '03301' });
  await player(f, { zip: '03301' });
  const g = (await api(a, 'POST', '/groups', { name: `Del group ${RUN.slice(-4)}` })).body;
  await api(b, 'POST', '/groups/join', { code: g.code });
  await api(c, 'POST', '/groups/join', { code: g.code });
  const inv = (await api(a, 'POST', '/invites')).body.token;
  await api(f, 'POST', `/invites/${inv}/accept`, { via: 'link' });
  const t = await today(a);
  for (const bl of t.rollCall.slice(0, 3)) await vote(a, day, bl.id, 'yea');
  await api(a, 'POST', '/results/filed-or-fake', { day, answers: Object.fromEntries(t.filedOrFake.slice(0, 3).map((x) => [x.id, x.real])), done: false });
  const pre = (await api(f, 'GET', '/friends')).body;
  const del = await api(a, 'DELETE', '/me');
  bug('E1 DELETE /me mid-game returns ok', del.status !== 200, J(del));
  const gm = await api(b, 'GET', `/groups/${g.id}`);
  const gl = (await api(b, 'GET', '/groups')).body;
  bug('E2 admin delete destroys the whole group for the 2 remaining members (no admin handover)', gm.status === 404 && !gl.groups.some((x) => x.id === g.id), `member GET /groups/:id -> ${gm.status}; groups left=${gl.groups.length}`);
  const post = await api(f, 'GET', '/friends');
  bug('E3 friend list no longer shows the deleted account', J(post.body).includes(a) || J(post.body).includes('Admin'), `friends before=${J(pre).length}B after=${J(post.body).length}B`);
  const me = await api(a, 'GET', '/me');
  bug('E4 same token after delete silently re-creates an empty account (200) instead of 401', me.status === 200, `status=${me.status} zip=${me.body.profile?.zip} username=${me.body.profile?.username} createdAt=${me.body.profile?.createdAt} daysPlayed=${me.body.stats?.daysPlayed}`);
  const t2 = await today(a);
  bug('E5 resurrected account has none of the old votes/answers', Object.keys(t2.progress.rollCall.votes).length > 0 || Object.keys(t2.progress.filedOrFake.answers).length > 0, J(t2.progress.rollCall));
  const nGroups = (await api(a, 'GET', '/groups')).body.groups.length;
  bug('E6 resurrected account has no old groups/friends', nGroups > 0 || J((await api(a, 'GET', '/friends')).body).includes(f), `groups=${nGroups}`);
  const freed = await player(`${P}-e-squat`, { username: `mv${RUN.slice(-6)}a` });
  const sq = (await api(`${P}-e-squat`, 'GET', '/me')).body.profile;
  bug('E7 deleted account\'s @username is immediately claimable by anyone', sq.username === `mv${RUN.slice(-6)}a`, `squatter username=${sq.username}`);
  const del2 = await api(a, 'DELETE', '/me');
  const del3 = await api(a, 'DELETE', '/me');
  bug('E8 DELETE /me twice is harmless', del2.status !== 200 || del3.status !== 200, `${del2.status},${del3.status}`);
  // race: delete while the user is creating groups
  let failures = [];
  for (let round = 0; round < 6; round++) {
    const r = `${P}-e-race${round}`;
    await player(r, { zip: '03301' });
    const res = await Promise.all([api(r, 'DELETE', '/me'), ...Array.from({ length: 8 }, (_, i) => api(r, 'POST', '/groups', { name: `Race ${round}-${i}` }))]);
    const statuses = res.map((x) => x.status);
    const left = Number(sql(`select count(*) from users where id='${r}'`));
    if (statuses.some((s) => s >= 500) || left) failures.push(`round${round}: ${statuses.join(',')} userRowLeft=${left}`);
  }
  bug('E9 DELETE /me racing POST /groups: always cleanly deleted (no 500, no leftover user row)', failures.length > 0, failures.join(' | ') || 'clean x6');
}

// ---------------------------------------------------------------- F. lawmakers
console.log('--- F. lawmakers');
{
  const counts = {};
  for (const [k, zip] of Object.entries(zips)) {
    const u = `${P}-l-${k}`;
    await player(u, { zip });
    const r = await api(u, 'GET', '/me/lawmakers');
    const b = r.body;
    counts[k] = `fed${b.federal.length}/st${b.state.length}/loc${b.local.length}`;
    bug(`F1 /me/lawmakers ${k}: 200 and no party before voting`, r.status !== 200 || [...b.federal, ...b.state, ...b.local].some((l) => l.party !== null), `${counts[k]} state=${b.stateName}`);
  }
  console.log(`info lawmaker counts ${J(counts)}`);
  const u = `${P}-l-austin`;
  const b0 = (await api(u, 'GET', '/me/lawmakers')).body;
  const bad = await Promise.all(['nonexistent', "x'%20OR%201=1", 'ocd-person%2Fnope', '%00'].map((id) => api(u, 'GET', `/lawmakers/${id}`)));
  bug('F2 nonexistent / hostile lawmaker ids -> 404, never 500', bad.some((x) => x.status !== 404), bad.map((x) => x.status).join(','));
  const nul = await Promise.all(['/lawmakers/%00', '/bills/%00', '/groups/preview/%00', '/geo/%00'].map((p) => api(u, 'GET', p)));
  bug('F2b NUL byte (%00) in a path param never gives 500 (lawmakers/bills/groups preview/geo)', nul.some((x) => x.status >= 500), nul.map((x) => x.status).join(','));
  const long = await api(u, 'GET', `/lawmakers/${'a'.repeat(5000)}`);
  bug('F3 5000-char id handled (<500)', long.status >= 500, `status=${long.status}`);
  // find a state-upper lawmaker with a recorded vote on today's Austin ballot and vote on it
  const t = await today(u);
  const sen = b0.state[0];
  const pre = (await api(u, 'GET', `/lawmakers/${encodeURIComponent(sen.id)}`)).body;
  const common = pre.votes.find((v) => t.rollCall.some((x) => x.id === v.billId));
  console.log(`info state lawmaker ${sen.name}: party before voting=${pre.party}, recorded votes=${pre.votes.length}, vote on today's ballot=${J(common)}`);
  if (common) {
    await vote(u, day, common.billId, 'yea');
    const post = (await api(u, 'GET', `/lawmakers/${encodeURIComponent(sen.id)}`)).body;
    const row = (await api(u, 'GET', '/me/lawmakers')).body.state.find((x) => x.id === sen.id);
    bug('F4 party appears after voting on one of the lawmaker\'s bills', !(post.party && row.party), `detail party=${post.party} list party=${row.party} shared=${post.agreement.shared}`);
  }
  // leak of hidden party through the sourced background
  const fed = b0.federal.find((l) => l.role.includes('Senate'));
  const d = (await api(`${P}-l-none`, 'GET', `/lawmakers/${encodeURIComponent(fed.id)}`)).body;
  const m = JSON.stringify([d.background, d.committees, d.links]).match(/Republican|Democratic/);
  bug('F5 hidden party (shared=0) still leaks through /lawmakers/:id background text', d.party === null && !!m, `party=${d.party} background mentions "${m?.[0]}"`);
  // move -> lawmakers follow the new ZIP
  const mv = `${P}-l-mover`;
  await player(mv, { zip: '78705' });
  const before = (await api(mv, 'GET', '/me/lawmakers')).body;
  await move(mv, '90210');
  const after = (await api(mv, 'GET', '/me/lawmakers')).body;
  bug('F6 /me/lawmakers follows the new ZIP (TX -> CA)', before.stateName !== 'Texas' || after.stateName !== 'California' || after.local.length !== 0, `${before.stateName} -> ${after.stateName}`);
}

// ---------------------------------------------------------------- G/H. midnight on a shimmed second instance
if (process.env.SKIP_MIDNIGHT) {
  console.log('skip G/H (SKIP_MIDNIGHT)');
} else {
  console.log('--- G/H. midnight rollover (own instance :8798 with Date shim)');
  const dir = mkdtempSync(join(tmpdir(), 'move-shim-'));
  const clock = join(dir, 'clock.txt');
  const shim = join(dir, 'shim.mjs');
  writeFileSync(shim, `import { readFileSync } from 'node:fs';
const Real = Date;
function nowMs() { try { const t = Real.parse(readFileSync(${J(clock)}, 'utf8').trim()); if (!Number.isNaN(t)) return t; } catch {} return Real.now(); }
class D extends Real { constructor(...a) { if (a.length === 0) super(nowMs()); else super(...a); } static now() { return nowMs(); } }
globalThis.Date = D;
`);
  const setClock = (iso) => writeFileSync(clock, iso);
  setClock('2026-10-26T04:59:55Z'); // 2026-10-25 23:59:55 CDT
  const env = { ...process.env, PORT: '8798' };
  delete env.DATABASE_URL;
  const srv = spawn('node', [`--env-file=${process.env.QA_ENV ?? SCRATCH + '/qa.env'}`, '--import', 'tsx', '--import', process.env.REGISTER ?? SCRATCH + '/register.mjs', '--import', shim, 'src/index.ts'],
    { cwd: join(import.meta.dirname, '..'), env, stdio: ['ignore', 'ignore', 'pipe'] });
  let srvErr = '';
  srv.stderr.on('data', (d) => (srvErr += d));
  const B2 = 'http://localhost:8798';
  const api2 = async (uid, method, path, body) => {
    const res = await fetch(B2 + path, { method, headers: { authorization: `Bearer ${uid}`, ...(body !== undefined ? { 'content-type': 'application/json' } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  };
  try {
    for (let i = 0; i < 60; i++) { try { if ((await fetch(B2 + '/health')).ok) break; } catch {} await new Promise((r) => setTimeout(r, 250)); }
    // --- G: no 2026-10-26 set exists
    sql(`delete from daily_sets where day='2026-10-26'`);
    const x = `${P}-g-x`, y = `${P}-g-y`;
    for (const u of [x, y]) { await api2(u, 'GET', '/me'); await api2(u, 'POST', '/me/location', { zip: '78705' }); }
    let t = (await api2(x, 'GET', '/today')).body;
    bug('G0 shim works: before midnight /today.day = 2026-10-25', t.day !== '2026-10-25', t.day);
    for (const b of t.rollCall.slice(0, 3)) await api2(x, 'POST', '/votes', { day: t.day, billId: b.id, vote: 'yea' });
    await api2(x, 'POST', '/results/filed-or-fake', { day: t.day, answers: Object.fromEntries(t.filedOrFake.slice(0, 3).map((c) => [c.id, c.real])), done: false });
    await api2(y, 'GET', '/today');
    setClock('2026-10-26T05:00:05Z'); // 2026-10-26 00:00:05 CDT, no set seeded for the 26th
    t = (await api2(x, 'GET', '/today')).body;
    bug('G1 after midnight with no new set, /today still serves 2026-10-25 (day does not advance)', t.day === '2026-10-25', `today.day=${t.day}; progress kept: votes=${Object.keys(t.progress.rollCall.votes).length}`);
    const v = await api2(x, 'POST', '/votes', { day: '2026-10-25', billId: t.rollCall[3].id, vote: 'yea' });
    const v26 = await api2(x, 'POST', '/votes', { day: '2026-10-26', billId: t.rollCall[3].id, vote: 'yea' });
    bug('G2 in-flight player can keep voting on yesterday\'s ballot after midnight (200); a vote tagged with the new day is refused (409)', v.status === 200 && v26.status === 409, `25->${v.status}, 26->${v26.status}`);
    await api2(x, 'POST', '/votes', { day: '2026-10-25', billId: t.rollCall[4].id, vote: 'yea' });
    const fin = await api2(x, 'POST', '/results/roll-call', { day: '2026-10-25' });
    console.log(`info G finish Roll Call after midnight on 10-25 ballot: ${J(fin)}`);
    const st26 = (await api2(x, 'GET', '/me')).body.stats;
    setClock('2026-10-27T05:00:05Z'); // two days on, still nothing seeded
    const st27 = (await api2(x, 'GET', '/me')).body.stats;
    const t27 = (await api2(x, 'GET', '/today')).body;
    const y27 = await api2(y, 'POST', '/votes', { day: '2026-10-25', billId: t27.rollCall[0].id, vote: 'nay' });
    bug('G3 two days past the last set: /today still 2026-10-25 and brand-new play on it still accepted', t27.day === '2026-10-25' && y27.status === 200, `day=${t27.day} newVote=${y27.status}`);
    bug('G4 streak for a daily player resets even though no ballot for the missed day could be played (streak 1 on 10-26 -> 0 on 10-27)', st26.currentStreak === 1 && st27.currentStreak === 0, `streak 10-26=${st26.currentStreak} 10-27=${st27.currentStreak} daysPlayed=${st27.daysPlayed}`);

    // --- H: repeated bill across days. Copy the whole 10-25 set to 10-26 (LOCAL QA DB only; removed in finally).
    setClock('2026-10-26T04:59:55Z'); // back to 10-25 23:59:55
    sql(`insert into daily_sets (day, scope, game, position, bill_id, payload) select '2026-10-26', scope, game, position, bill_id, payload from daily_sets where day='2026-10-25' on conflict do nothing`);
    const w = `${P}-h-w`, z = `${P}-h-z`;
    for (const u of [w, z]) { await api2(u, 'GET', '/me'); await api2(u, 'POST', '/me/location', { zip: '78705' }); }
    let tw = (await api2(w, 'GET', '/today')).body;
    bug('H0 with a 10-26 set present, 10-25 23:59:55 still serves 10-25', tw.day !== '2026-10-25', tw.day);
    for (const b of tw.rollCall) await api2(w, 'POST', '/votes', { day: '2026-10-25', billId: b.id, vote: 'yea' });
    const f25 = await api2(w, 'POST', '/results/roll-call', { day: '2026-10-25' });
    // z: in-flight at midnight (2 of 5 voted)
    for (const b of tw.rollCall.slice(0, 2)) await api2(z, 'POST', '/votes', { day: '2026-10-25', billId: b.id, vote: 'yea' });
    await api2(z, 'POST', '/results/filed-or-fake', { day: '2026-10-25', answers: Object.fromEntries(tw.filedOrFake.slice(0, 4).map((c) => [c.id, c.real])), done: false });
    setClock('2026-10-26T05:00:05Z');
    const tw2 = (await api2(w, 'GET', '/today')).body;
    bug('H1 after midnight with a 10-26 set, /today advances to 2026-10-26 with fresh (empty) progress', tw2.day !== '2026-10-26' || Object.keys(tw2.progress.rollCall.votes).length !== 0, `day=${tw2.day} votes=${Object.keys(tw2.progress.rollCall.votes).length} (finished 10-25: ${J(f25.body)})`);
    // in-flight z
    const zv = await api2(z, 'POST', '/votes', { day: '2026-10-25', billId: tw.rollCall[2].id, vote: 'yea' });
    const zf = await api2(z, 'POST', '/results/filed-or-fake', { day: '2026-10-25', answers: Object.fromEntries(tw.filedOrFake.map((c) => [c.id, c.real])), done: true });
    bug('H2 in-flight vote/results for yesterday are refused after midnight with 409 "ballot closed"', !(zv.status === 409 && zf.status === 409), `vote=${zv.status} fof=${zf.status} ${J(zf.body)}`);
    const tz = (await api2(z, 'GET', '/today')).body;
    console.log(`info H2 z's pre-midnight partial work: 10-26 progress votes=${Object.keys(tz.progress.rollCall.votes).length}, FoF answers=${Object.keys(tz.progress.filedOrFake.answers).length}; DB 10-25 votes=${sql(`select count(*) from votes where user_id='${z}'`)} rows`);
    // repeated bill: w already voted yea on these same bills on 10-25
    const sameIds = tw2.rollCall.filter((b) => tw.rollCall.some((o) => o.id === b.id)).map((b) => b.id);
    console.log(`info H3 repeated bills 10-25 -> 10-26: ${sameIds.length}/${tw2.rollCall.length}`);
    const h25a = (await api2(w, 'GET', '/me/history/roll-call')).body.days.find((d) => d.day === '2026-10-25');
    let ok = 0;
    for (const b of tw2.rollCall) ok += (await api2(w, 'POST', '/votes', { day: '2026-10-26', billId: b.id, vote: 'nay' })).status === 200 ? 1 : 0;
    const p26 = (await api2(w, 'GET', '/today')).body.progress.rollCall.votes;
    const fin26 = await api2(w, 'POST', '/results/roll-call', { day: '2026-10-26' });
    const dbDays = sql(`select day||':'||vote from votes where user_id='${w}' order by bill_id`).split('\n').join(' ');
    bug('H3 a bill repeated on a later day: votes are accepted (200) but stay tagged with the old day, Roll Call can never be finished', ok === tw2.rollCall.length && fin26.status === 400,
      `vote POSTs 200=${ok}/${tw2.rollCall.length}; /today 10-26 progress votes=${Object.keys(p26).length}; finish=${fin26.status} ${J(fin26.body)}; DB(day:vote)=${dbDays}`);
    const h25b = (await api2(w, 'GET', '/me/history/roll-call')).body.days.find((d) => d.day === '2026-10-25');
    bug('H3b voting the repeated bill on day 2 silently rewrites the day-1 vote in history', J(h25a.bills.map((x) => x.vote)) !== J(h25b.bills.map((x) => x.vote)), `10-25 history votes before=${h25a.bills.map((x) => x.vote)} after=${h25b.bills.map((x) => x.vote)}`);
    const reset25 = await api2(w, 'POST', '/votes/reset', { day: '2026-10-25' });
    bug('H3c player cannot escape: day-2 Roll Call unfinishable and day-1 reset refused', fin26.status === 400 && reset25.status === 409, `reset 10-25 -> ${reset25.status} ${J(reset25.body)}`);
    const reset = await api2(w, 'POST', '/votes/reset', { day: '2026-10-26' });
    const stats = (await api2(w, 'GET', '/me')).body.stats;
    console.log(`info H4 /votes/reset 10-26 -> ${J(reset)}; DB votes still ${sql(`select count(*) from votes where user_id='${w}'`)}; stats.billsVoted=${stats.billsVoted}`);
    // players with FoF/LS can still play 10-26 (different ids?)
    const fof26 = await api2(w, 'POST', '/results/filed-or-fake', { day: '2026-10-26', answers: Object.fromEntries(tw2.filedOrFake.map((c) => [c.id, c.real])), done: true });
    console.log(`info H5 FoF on 10-26 (same captions as 10-25) -> ${J(fof26)} (results are keyed by day so repeats are fine there)`);
  } finally {
    sql(`delete from daily_sets where day='2026-10-26'`);
    srv.kill();
    if (srvErr.trim()) console.log('info shim server stderr:', srvErr.slice(0, 300));
  }
  const left = sql(`select count(*) from daily_sets where day>'2026-10-25'`);
  bug('cleanup: no test daily_sets left after 2026-10-25', left !== '0', `rows=${left}`);
}
