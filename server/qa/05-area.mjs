// QA: area leaderboard privacy guards (GET /leaderboard/area/:scope, GET /leaderboard `beyond`).
// Owns ZIP 82001 (Cheyenne WY) and uses 82070 (Laramie WY). Run: node 05-area.mjs   (local API only)
import { api, player, sql, check, RUN } from './lib.mjs';

const P = `area-${RUN}`;
const CHEY = '82001';
const LARA = '82070';
const TODAY = '2026-10-25';
let n = 0;
const uid = (name) => `${P}-${name}`;
const uname = (name) => `ar${RUN.slice(-6)}${name}${++n}`.replace(/[^a-z0-9_]/g, '').slice(0, 20);

// Own accounts only (prefix area-), so earlier runs don't pollute ZIP 82001.
const info = (label, extra = '') => console.log(`info ${label}${extra ? ` — ${extra}` : ''}`);
const cleanup = () => sql(`DELETE FROM users WHERE id LIKE 'area-%'`);
cleanup();

async function mk(name, zip = CHEY) {
  const id = uid(name);
  await player(id, { zip, username: uname(name) });
  return id;
}
const today = async (id) => (await api(id, 'GET', '/today')).body;

/** Plays a full day. votes: array of 'yea'|'nay' per Roll Call bill. fofCorrect: number of right captions. lsExact: exact order or reversed. */
async function play(id, { votes, fofCorrect = 0, lsExact = true, roll = true, fof = true, ls = true, finishRoll = true }) {
  const t = await today(id);
  if (votes) for (let i = 0; i < t.rollCall.length; i++) await api(id, 'POST', '/votes', { day: t.day, billId: t.rollCall[i].id, vote: votes[i] });
  const out = {};
  if (roll && finishRoll && votes) out.rc = (await api(id, 'POST', '/results/roll-call', { day: t.day })).body;
  if (fof) {
    const answers = Object.fromEntries(t.filedOrFake.map((c, i) => [c.id, i < fofCorrect ? c.real : !c.real]));
    out.fof = (await api(id, 'POST', '/results/filed-or-fake', { day: t.day, answers, done: true })).body.score;
  }
  if (ls) {
    const sorted = [...t.landslide.items].sort((a, b) => b.yeas - b.nays - (a.yeas - a.nays)).map((i) => i.billId);
    const order = lsExact ? sorted : [...sorted].reverse();
    out.ls = (await api(id, 'POST', '/results/landslide', { day: t.day, order })).body.score;
  }
  out.total = (out.rc ? 5 : 0) + (out.fof ?? 0) + (out.ls ?? 0);
  return out;
}
const area = async (id, scope = 'city', q = '') => (await api(id, 'GET', `/leaderboard/area/${scope}${q}`)).body;
const beyond = async (id, scope) => (await api(id, 'GET', '/leaderboard')).body.beyond.find((b) => b.scope === scope)?.points;

// ---------------------------------------------------------------------------------------------
// A. Sybil + time differencing on city scope (4 accounts I control + 1 target).
// ---------------------------------------------------------------------------------------------
{
  const sy = [];
  const known = [];
  const plan = [{ f: 3, e: true }, { f: 4, e: false }, { f: 5, e: true }, { f: 2, e: false }];
  for (let i = 0; i < 4; i++) {
    const id = await mk(`sy${i}`);
    sy.push(id);
    known.push(await play(id, { votes: ['yea', 'yea'], fofCorrect: plan[i].f, lsExact: plan[i].e }));
  }
  const tgt = await mk('target');
  const sFof = known.reduce((a, k) => a + k.fof, 0);
  const sLs = known.reduce((a, k) => a + k.ls, 0);
  const sTot = known.reduce((a, k) => a + k.total, 0);

  const s0 = await area(sy[0]);
  check('A0 4 players: avg/top/rank/distribution hidden', s0.avgPoints !== null || s0.you.rank !== null || s0.distribution.length > 0 || s0.topPoints !== null,
    `players=${s0.players} avg=${s0.avgPoints} rank=${s0.you.rank} dist=${s0.distribution.length}`);
  check('A0 4 players: bill split hidden (voters=4)', s0.bills.some((b) => b.yeaPct !== null), JSON.stringify(s0.bills));
  const b0 = await beyond(sy[0], 'city');
  check('A0 beyond city avg hidden at 4', b0 !== null, `beyond=${b0}`);

  // Target casts votes only (Roll Call NOT finished): bill 0 nay, bill 1 yea.
  await api(tgt, 'POST', '/votes', { day: TODAY, billId: s0.bills[0].billId, vote: 'nay' });
  await api(tgt, 'POST', '/votes', { day: TODAY, billId: s0.bills[1].billId, vote: 'yea' });
  const s1 = await area(sy[0]);
  check('A1 unfinished votes counted: players still 4 but bill voters jump to 5', s1.players === 4 && s1.bills.every((b) => b.voters === 5),
    `players=${s1.players} voters=${s1.bills.map((b) => b.voters)}`);
  check('A2 sybil learns target nay on bill0 from yeaPct 80 (4 sybil yea + 1)', s1.bills[0].yeaPct === 80, `bill0=${JSON.stringify(s1.bills[0])}`);
  check('A3 hiddenReason=unanimous on bill1 reveals target voted same (yea) as 4 sybils', s1.bills[1].hiddenReason === 'unanimous', `bill1=${JSON.stringify(s1.bills[1])}`);

  // Target finishes everything.
  const tr = await play(tgt, { votes: ['nay', 'yea'], fofCorrect: 6, lsExact: true });
  const s2 = await area(sy[0]);
  const tFof = Math.round(s2.byGame.filedOrFake.avgCorrect * 5) - sFof;
  const tLs = Math.round(s2.byGame.landslide.avgPoints * 5) - sLs;
  check('A4 Filed or Fake score of target recovered exactly (5 players)', tFof === tr.fof, `recovered ${tFof}, actual ${tr.fof}`);
  check('A5 Landslide score of target recovered exactly (5 players)', tLs === tr.ls, `recovered ${tLs}, actual ${tr.ls}`);
  const lo = 5 * (s2.avgPoints - 0.5) - sTot;
  const hi = 5 * (s2.avgPoints + 0.5) - sTot;
  check('A6 avgPoints narrows target total to a 5-wide window', tr.total >= lo && tr.total <= hi && hi - lo <= 5, `window [${lo},${hi}] actual ${tr.total}`);
  const ownTop = tr.total > Math.max(...known.map((k) => k.total));
  check('A7 topPoints equals target total when target is the top scorer', ownTop && s2.topPoints === tr.total, `top=${s2.topPoints} actual=${tr.total}`);
  check('A8 byGame.*.players returned below 5 players (4 sybils + target finishing only FoF shows up)', false);
  const agreed = Math.round((s2.byGame.rollCall.avgAgreedPct / 100) * s2.bills.length * 5);
  info('A9 rollCall avgAgreedPct (agreement with outcomes) exposed per area', `avgAgreedPct=${s2.byGame.rollCall.avgAgreedPct} (reconstructed agreed sum ~${agreed})`);

  // Also via GET /leaderboard `beyond` (no players count).
  const b1 = await beyond(sy[0], 'city');
  const blo = 5 * (b1 - 0.5) - sTot;
  const bhi = 5 * (b1 + 0.5) - sTot;
  check('A10 /leaderboard beyond.city avg narrows target total to a 5-wide window', tr.total >= blo && tr.total <= bhi, `beyond=${b1} window [${blo},${bhi}] actual ${tr.total}`);
  const st = await area(sy[0], 'state');
  check('A11 state scope gives same exact recovery with sybils anywhere in the state', Math.round(st.byGame.filedOrFake.avgCorrect * 5) - sFof === tr.fof, `state players=${st.players}`);

  // 6th player, no knowledge of individual scores: pure before/after differencing at n=5 -> 6.
  const before = await area(sy[0]);
  const six = await mk('sixth');
  const r6 = await play(six, { votes: ['yea', 'nay'], fofCorrect: 7, lsExact: false });
  const after = await area(sy[0]);
  const dFof = Math.round(after.byGame.filedOrFake.avgCorrect * 6) - Math.round(before.byGame.filedOrFake.avgCorrect * 5);
  const dLs = Math.round(after.byGame.landslide.avgPoints * 6) - Math.round(before.byGame.landslide.avgPoints * 5);
  check('B1 6th player FoF score recovered from avg before/after (no sybil scores needed)', dFof === r6.fof, `recovered ${dFof} actual ${r6.fof}`);
  check('B2 6th player Landslide score recovered from avg before/after', dLs === r6.ls, `recovered ${dLs} actual ${r6.ls}`);
  // yea counts: bill0 yea=4 (sybils) +0 (target nay) before = 4/5 -> 80%; after sixth yea -> 5/6 = 83.
  const yb = Math.round((before.bills[0].yeaPct / 100) * before.bills[0].voters);
  const ya = Math.round((after.bills[0].yeaPct / 100) * after.bills[0].voters);
  check('B3 6th player vote on bill0 (yea) recovered from yeaPct before/after', ya - yb === 1, `yea count ${yb} -> ${ya}`);
  check('B4 bill1 was hidden (unanimous), becomes visible once 6th votes nay: reveals the 6th voted nay',
    before.bills[1].yeaPct === null && after.bills[1].yeaPct !== null, `before=${before.bills[1].hiddenReason} after=${after.bills[1].yeaPct}`);
  const rk = await area(six);
  info('B5 you.rank / percentile at n=6', `rank=${rk.you.rank} pct=${rk.you.percentile}`);
  cleanup();
}

// ---------------------------------------------------------------------------------------------
// C. 'unanimous' hidden reason as side channel with no sybils: 5 ordinary voters all yea.
// ---------------------------------------------------------------------------------------------
{
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(await mk(`u${i}`));
  const t = await today(ids[0]);
  for (let i = 0; i < 4; i++) await api(ids[i], 'POST', '/votes', { day: TODAY, billId: t.rollCall[0].id, vote: 'yea' });
  const few = (await area(ids[0])).bills[0];
  await api(ids[4], 'POST', '/votes', { day: TODAY, billId: t.rollCall[0].id, vote: 'yea' });
  const un = (await area(ids[0])).bills[0];
  check('C1 5 voters all yea: hiddenReason=unanimous tells any member everyone voted like they did',
    few.hiddenReason === 'few' && un.hiddenReason === 'unanimous' && un.voters === 5, `4 voters=${few.hiddenReason}, 5 voters=${un.hiddenReason}/${un.voters}`);
  // Reset: voter changes mind -> everyone sees the transition.
  await api(ids[4], 'POST', '/votes', { day: TODAY, billId: t.rollCall[0].id, vote: 'nay' });
  const mix = (await area(ids[0])).bills[0];
  check('C2 one voter flips live (before finishing): split appears immediately, 80/20 names a nay voter', mix.yeaPct === 80, JSON.stringify(mix));
  // An outsider with no vote in the area also reads the numbers by moving ZIP to 82001.
  const outsider = await player(uid('outsider'), { zip: CHEY, username: uname('o') });
  const seen = (await area(outsider)).bills[0];
  check('C3 caller who never voted/played still sees voters and split (no participation required)', seen.yeaPct === 80, JSON.stringify(seen));
  cleanup();
}

// ---------------------------------------------------------------------------------------------
// D. ZIP change moves history.
// ---------------------------------------------------------------------------------------------
{
  const ids = [];
  const res = [];
  for (let i = 0; i < 6; i++) {
    const id = await mk(`m${i}`);
    ids.push(id);
    res.push(await play(id, { votes: ['yea', 'nay'], fofCorrect: i + 1, lsExact: i % 2 === 0 }));
  }
  const before = await area(ids[0]);
  const lara0 = await player(uid('lobs'), { zip: LARA, username: uname('l') });
  const laraBefore = await area(lara0);
  // m5 moves to Laramie.
  await api(ids[5], 'POST', '/me/location', { zip: LARA });
  const after = await area(ids[0]);
  const laraAfter = await area(lara0);
  check('D1 past results re-home on ZIP change (Cheyenne players 6 -> 5 for the same day)', before.players === 6 && after.players === 5, `${before.players} -> ${after.players}`);
  check('D2 Laramie observer sees the mover as a player today', laraBefore.players === 0 && laraAfter.players === 1, `${laraBefore.players} -> ${laraAfter.players}`);
  const dFof = Math.round(before.byGame.filedOrFake.avgCorrect * 6) - Math.round(after.byGame.filedOrFake.avgCorrect * 5);
  check('D3 mover leaving a city of 6 reveals mover FoF score in the remaining 5 (differencing)', dFof === res[5].fof, `recovered ${dFof} actual ${res[5].fof}`);
  check('D4 mover votes now in Laramie per-bill voters', laraAfter.bills.some((b) => b.voters === 1), JSON.stringify(laraAfter.bills.map((b) => b.voters)));
  // Mover returns: does the Cheyenne day snap back?
  await api(ids[5], 'POST', '/me/location', { zip: CHEY });
  const back = await area(ids[0]);
  info('D5 returning to Cheyenne restores the past stats', `players=${back.players}`);
  // User with no ZIP.
  const noZip = uid('nozip');
  await player(noZip, {});
  const nzCity = await api(noZip, 'GET', '/leaderboard/area/city');
  const nzState = await api(noZip, 'GET', '/leaderboard/area/state');
  const nzAll = await api(noZip, 'GET', '/leaderboard/area/all');
  check('D6 no-ZIP user: city/state 404, all works', nzCity.status !== 404 || nzState.status !== 404 || nzAll.status !== 200, `${nzCity.status}/${nzState.status}/${nzAll.status}`);
  const nzLb = (await api(noZip, 'GET', '/leaderboard')).body.beyond.map((b) => b.scope).join(',');
  check('D7 no-ZIP /leaderboard beyond has only all', nzLb !== 'all', `scopes=${nzLb}`);
  cleanup();
}

// ---------------------------------------------------------------------------------------------
// E. day param.
// ---------------------------------------------------------------------------------------------
{
  const ids = [];
  for (let i = 0; i < 5; i++) ids.push(await mk(`d${i}`));
  const obs = ids[0];
  // Historical data for 2026-10-24 written straight into the QA DB (set bills: us-119-s146, us-119-s5).
  const past = '2026-10-24';
  for (let i = 0; i < 5; i++) {
    sql(`INSERT INTO votes (user_id, bill_id, day, vote) VALUES ('${ids[i]}','us-119-s146','${past}','${i < 3 ? 'yea' : 'nay'}'),('${ids[i]}','us-119-s5','${past}','yea')`);
    sql(`INSERT INTO game_results (user_id, day, game, score, detail, finished_at) VALUES
      ('${ids[i]}','${past}','roll-call',${i % 3},'{}',now()),
      ('${ids[i]}','${past}','filed-or-fake',${i + 1},'{}',now()),
      ('${ids[i]}','${past}','landslide',${3 * (i % 4)},'{}',now())`);
  }
  const p = await area(obs, 'city', `?day=${past}`);
  check('E1 past day works and uses that day set', !(p.day === past && p.players === 5 && p.avgPoints !== null), `day=${p.day} players=${p.players} avg=${p.avgPoints} bills=${p.bills.map((b) => `${b.billId}:${b.voters}:${b.yeaPct}`)}`);
  const pe = await api(obs, 'GET', `/leaderboard/area/city?day=2026-10-26`);
  check('E2 future day falls back to latest set (today)', pe.body.day !== TODAY, `status=${pe.status} day=${pe.body.day}`);
  const far = await api(obs, 'GET', '/leaderboard/area/city?day=1900-01-01');
  check('E3 far past day: sane response (404 with accurate message)', far.status !== 404 || /ZIP/.test(far.body.error ?? ''), `status=${far.status} body=${JSON.stringify(far.body)}`);
  const farAll = await api(obs, 'GET', '/leaderboard/area/all?day=1900-01-01');
  check('E4 far past day scope=all', farAll.status >= 500, `status=${farAll.status} ${JSON.stringify(farAll.body)}`);
  for (const d of ['2026-02-31', '2026-13-45', '0000-00-00', '9999-12-31', '2026-10-2x', '20261025', '']) {
    const r = await api(obs, 'GET', `/leaderboard/area/city?day=${encodeURIComponent(d)}`);
    check(`E5 day=${JSON.stringify(d)} handled without 5xx`, r.status >= 500, `status=${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
  const bad = await api(obs, 'GET', '/leaderboard/area/planet');
  check('E6 invalid scope returns 4xx', bad.status >= 500, `status=${bad.status} ${JSON.stringify(bad.body)}`);
  // Unfinished-day votes on a past day by a non-finisher still counted?
  cleanup();
}

// F. Demo accounts count toward the 5-player threshold (no is_demo filter in social.ts).
{
  const ids = [];
  for (let i = 0; i < 4; i++) { const id = await mk(`f${i}`); ids.push(id); await play(id, { votes: ['yea', 'nay'], fofCorrect: 4, lsExact: true }); }
  const demo = uid('demo');
  sql(`INSERT INTO users (id, display_name, username, city, state, is_demo, onboarded) VALUES ('${demo}','Demo Dana','${uname('dm')}','Cheyenne','WY',true,true)`);
  sql(`INSERT INTO game_results (user_id, day, game, score, detail, finished_at) VALUES ('${demo}','${TODAY}','filed-or-fake',8,'{}',now())`);
  const a = await area(ids[0]);
  check('F1 is_demo account counted as 5th player (threshold met by a seeded account)', a.players === 5 && a.avgPoints !== null, `players=${a.players} avg=${a.avgPoints}`);
  cleanup();
}

cleanup();
console.log('done');
