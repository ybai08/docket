// Cheater persona: attacks game scoring and rules. Run: node 01-cheater.mjs (from server/qa).
// check(label, isBug, extra) prints BUG when isBug is true, ok otherwise.
import { api, player, sql, check, RUN } from './lib.mjs';

const P = `cheat-${RUN}`;
const AUSTIN = '78705';
const LA = '90210';
const TODAY = '2026-10-25';
const YESTERDAY = '2026-10-24';
let n = 0;
const mk = async (zip = AUSTIN) => player(`${P}-u${++n}`, { zip });
const today = async (uid) => (await api(uid, 'GET', '/today')).body;
const progress = async (uid) => (await api(uid, 'GET', '/results/today')).body;
const points = async (uid) => {
  const lb = (await api(uid, 'GET', '/leaderboard')).body;
  return lb.board.find((b) => b.isYou)?.points;
};
const perfectFof = (t) => Object.fromEntries(t.filedOrFake.map((c) => [c.id, c.real]));
const perfectLs = (t) =>
  [...t.landslide.items].sort((a, b) => b.yeas - b.nays - (a.yeas - a.nays)).map((i) => i.billId);
const voteAll = async (uid, t, pick = (b) => (b.passed ? 'yea' : 'nay')) => {
  for (const b of t.rollCall) await api(uid, 'POST', '/votes', { day: t.day, billId: b.id, vote: pick(b) });
};
const dbRows = (uid) => sql(`select game||':'||coalesce(score::text,'null')||':'||(finished_at is not null) from game_results where user_id='${uid}' order by game`);

// ---------------------------------------------------------------- 1. /today leaks answers
{
  const u = await mk();
  const t = await today(u);
  const fofLeak = t.filedOrFake.every((c) => typeof c.real === 'boolean');
  const expLeak = t.filedOrFake.every((c) => typeof c.explanation === 'string');
  check('today leaks Filed or Fake `real` flag for every caption', fofLeak, `${t.filedOrFake.length} captions`);
  check('today leaks Filed or Fake `explanation` (says Real/Docket wrote this) for every caption', expLeak);
  check('today leaks Landslide yeas/nays for every item', t.landslide.items.every((i) => Number.isFinite(i.yeas) && Number.isFinite(i.nays)), JSON.stringify(t.landslide.items[0]));
  check('today leaks Roll Call `passed`/chamberVotes/outcome before voting (not scored on agreement, info)', t.rollCall.every((b) => typeof b.passed === 'boolean' && b.chamberVotes?.length));

  // Perfect play from /today data only.
  const f = await api(u, 'POST', '/results/filed-or-fake', { day: t.day, answers: perfectFof(t), done: true });
  check('script gets perfect Filed or Fake (8/8) from /today alone', f.body.score === t.filedOrFake.length, `score=${f.body.score}`);
  const l = await api(u, 'POST', '/results/landslide', { day: t.day, order: perfectLs(t) });
  check('script gets perfect Landslide (12/12) from /today alone', l.body.score === t.landslide.items.length * 3, `score=${l.body.score}`);
  await voteAll(u, t);
  const r = await api(u, 'POST', '/results/roll-call', { day: t.day });
  console.log(`info Roll Call response for max agreement: ${JSON.stringify(r.body)} (set size ${t.rollCall.length})`);
  const pts = await points(u);
  check('daily leaderboard points for perfect play exceed 25 (perfect play = 25 max)', pts > 25, `points=${pts}`);
  console.log(`info perfect-play points = ${pts} (expected 5+8+12=25)`);
  console.log(`info db rows: ${dbRows(u).replace(/\n/g, ' | ')}`);
  // Vote against every outcome: stored/returned score should still be the flat 5 if "never scored on agreement" held.
  const w = await mk();
  const tw = await today(w);
  await voteAll(w, tw, (b) => (b.passed ? 'nay' : 'yea'));
  const rw = await api(w, 'POST', '/results/roll-call', { day: TODAY });
  const rcRow = sql(`select score from game_results where user_id='${w}' and game='roll-call'`);
  check('roll-call game_results.score stores agreement count (0 here), not the flat 5 of the stated rule; /results response + /today progress.rollCallAgreed expose it', rcRow !== '5', `stored=${rcRow} response=${JSON.stringify(rw.body)} leaderboard points=${await points(w)}`);
  check('Roll Call finisher voting against every outcome gets flat 5 on leaderboard (rule holds in POINTS_SQL)', (await points(w)) !== 5, `points=${await points(w)}`);
  const hw = (await api(w, 'GET', '/me/history/roll-call')).body;
  console.log(`info history for all-disagree player: ${JSON.stringify(hw.summary)} day0=${JSON.stringify({ score: hw.days[0]?.score, outOf: hw.days[0]?.outOf })}`);
  const hist = (await api(u, 'GET', '/me/history/roll-call')).body;
  console.log(`info roll-call history summary: ${JSON.stringify(hist.summary)}`);
  const area = await api(u, 'GET', '/leaderboard/area/all');
  console.log(`info area/all: ${JSON.stringify(area.body).slice(0, 300)}`);
}

// ---------------------------------------------------------------- 2. Votes on bills not in set / bad days
{
  const u = await mk();
  const t = await today(u);
  const billId = t.rollCall[0].id;
  const otherState = sql(`select bill_id from daily_sets where day='${TODAY}' and game='roll-call' and scope='AK' limit 1`);
  const past = sql(`select bill_id from daily_sets where day='${YESTERDAY}' and game='roll-call' and scope='TX' limit 1`);
  const notInSet = async (label, id, day = TODAY) => {
    const r = await api(u, 'POST', '/votes', { day, billId: id, vote: 'yea' });
    check(`vote on ${label} accepted`, r.status === 200, `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
    check(`vote on ${label} gives 500`, r.status >= 500);
  };
  await notInSet('other-state bill (AK)', otherState);
  await notInSet('yesterday TX bill, day=today', past);
  await notInSet('yesterday TX bill, day=yesterday', past, YESTERDAY);
  await notInSet('nonexistent id', 'nope-123');
  await notInSet('empty id', '');
  await notInSet('sql-ish id', "x'; drop table votes;--");
  await notInSet('very long id', 'a'.repeat(100000));
  const rows = sql(`select count(*) from votes where user_id='${u}'`);
  check('no stray votes stored after bad-bill attempts', rows !== '0', `rows=${rows}`);

  for (const [label, day] of [
    ['yesterday', YESTERDAY], ['tomorrow', '2026-10-26'], ['far future', '2099-01-01'], ['empty day', ''], ['abc', 'abc'],
    ['trailing space', `${TODAY} `], ['ISO datetime', `${TODAY}T00:00:00Z`], ['unpadded', '2026-10-5'], ['"today"', 'today'], ['"infinity"', 'infinity'], ['number', 20261025], ['null', null], ['2026-02-30', '2026-02-30'],
  ]) {
    const r = await api(u, 'POST', '/votes', { day, billId, vote: 'yea' });
    check(`POST /votes day=${label} accepted`, r.status === 200, `status=${r.status} ${JSON.stringify(r.body).slice(0, 90)}`);
    check(`POST /votes day=${label} gives 5xx`, r.status >= 500, `status=${r.status}`);
  }
  const bad = [['missing vote', { day: TODAY, billId }], ['vote=maybe', { day: TODAY, billId, vote: 'maybe' }], ['vote=YEA', { day: TODAY, billId, vote: 'YEA' }]];
  for (const [label, body] of bad) {
    const r = await api(u, 'POST', '/votes', body);
    check(`POST /votes ${label} accepted`, r.status === 200 || r.status >= 500, `status=${r.status}`);
  }
  for (const [label, body] of [['malformed json', '{bad'], ['array', '[]'], ['null body', 'null']]) {
    const r = await api(u, 'POST', '/votes', body);
    check(`POST /votes ${label} gives 5xx`, r.status >= 500, `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  }
  // /votes/reset with odd days
  for (const [label, day] of [['abc', 'abc'], ['"today"', 'today'], ['yesterday', YESTERDAY], ['empty', ''], ['2026-02-30', '2026-02-30'], ['number', 5]]) {
    const r = await api(u, 'POST', '/votes/reset', { day });
    check(`POST /votes/reset day=${label} gives 5xx`, r.status >= 500, `status=${r.status} ${JSON.stringify(r.body).slice(0, 100)}`);
  }
}

// ---------------------------------------------------------------- 2b. reset of another (unfinished) day deletes that day's votes; vote PK across days
{
  const u = await mk();
  const t = await today(u);
  // Simulate a vote left from yesterday on a bill that also appears today (PK is (user_id, bill_id)).
  const b = t.rollCall[0];
  sql(`insert into votes(user_id,bill_id,day,vote) values ('${u}','${b.id}','${YESTERDAY}','nay')`);
  const r = await api(u, 'POST', '/votes', { day: TODAY, billId: b.id, vote: 'yea' });
  const row = sql(`select day||':'||vote from votes where user_id='${u}' and bill_id='${b.id}'`);
  console.log(`info vote on bill already voted on an earlier day: status=${r.status} row=${row}`);
  check('re-voting a bill that has an older vote keeps the OLD day on the row (today progress misses it; Roll Call cannot be finished)', row.startsWith(YESTERDAY), `row=${row}`);
  await voteAll(u, t);
  const fin = await api(u, 'POST', '/results/roll-call', { day: TODAY });
  check('Roll Call blocked "Vote on every bill first" after voting on all bills (bill repeated across days)', fin.status === 400, `status=${fin.status} ${JSON.stringify(fin.body)}`);
  // reset with yesterday deletes yesterday's unfinished votes
  const rr = await api(u, 'POST', '/votes/reset', { day: YESTERDAY });
  const left = sql(`select count(*) from votes where user_id='${u}' and day='${YESTERDAY}'`);
  check('/votes/reset can wipe votes of a non-current day (unfinished)', rr.status === 200 && left === '0', `status=${rr.status} left=${left}`);
}

// ---------------------------------------------------------------- 3. Replay finished games
{
  const u = await mk();
  const t = await today(u);
  const fof = perfectFof(t);
  const bad = Object.fromEntries(Object.keys(fof).map((k) => [k, !fof[k]]));
  const a = await api(u, 'POST', '/results/filed-or-fake', { day: TODAY, answers: bad, done: true });
  const b = await api(u, 'POST', '/results/filed-or-fake', { day: TODAY, answers: fof, done: true });
  check('Filed or Fake replay after done is re-scored', b.body.score === 8, `first=${JSON.stringify(a.body)} replay=${JSON.stringify(b.body)}`);
  const p1 = await progress(u);
  check('Filed or Fake stored score changed after replay', p1.filedOrFake.score !== 0, `score=${p1.filedOrFake.score}`);
  const c = await api(u, 'POST', '/results/filed-or-fake', { day: TODAY, answers: {}, done: false });
  const p2 = await progress(u);
  check('done:false replay after finish un-finishes the game', p2.filedOrFake.done === false, `resp=${JSON.stringify(c.body)}`);

  const order = perfectLs(t);
  const l1 = await api(u, 'POST', '/results/landslide', { day: TODAY, order: [...order].reverse() });
  const l2 = await api(u, 'POST', '/results/landslide', { day: TODAY, order });
  const p3 = await progress(u);
  check('Landslide replay overwrote score', l2.body.score !== undefined, `first=${JSON.stringify(l1.body)} replay=${JSON.stringify(l2.body)} stored=${p3.landslide.score}`);
  console.log(`info landslide replay response=${JSON.stringify(l2.body)}`);

  await voteAll(u, t, () => 'yea');
  const r1 = await api(u, 'POST', '/results/roll-call', { day: TODAY });
  const flip = await api(u, 'POST', '/votes', { day: TODAY, billId: t.rollCall[0].id, vote: 'nay' });
  check('POST /votes accepted after Roll Call finished', flip.status === 200, `status=${flip.status}`);
  const rs = await api(u, 'POST', '/votes/reset', { day: TODAY });
  check('POST /votes/reset accepted after Roll Call finished', rs.status === 200, `status=${rs.status}`);
  const r2 = await api(u, 'POST', '/results/roll-call', { day: TODAY });
  const votesLeft = sql(`select count(*) from votes where user_id='${u}'`);
  check('votes deleted/changed after finish', votesLeft !== String(t.rollCall.length), `votes=${votesLeft}, finish=${JSON.stringify(r1.body)} replay=${JSON.stringify(r2.body)}`);
}

// ---------------------------------------------------------------- 4. Filed or Fake input abuse
{
  const u = await mk();
  const t = await today(u);
  const ids = t.filedOrFake.map((c) => c.id);
  const fof = perfectFof(t);
  const post = (body) => api(u, 'POST', '/results/filed-or-fake', { day: TODAY, ...body });

  let r = await post({ answers: { [ids[0]]: true }, done: false });
  let p = await progress(u);
  console.log(`info partial save (1 answer, done:false) -> ${r.status} ${JSON.stringify(r.body)}; stored ${Object.keys(p.filedOrFake.answers).length} answer(s)`);
  r = await post({ answers: { [ids[0]]: !fof[ids[0]] }, done: false }); // change answer
  p = await progress(u);
  console.log(`info changing a saved partial answer is allowed: ${p.filedOrFake.answers[ids[0]] === !fof[ids[0]]} (no score/feedback until done, but /today already leaks answers)`);
  // Does a second partial save merge or replace?
  r = await post({ answers: { [ids[1]]: true }, done: false });
  p = await progress(u);
  check('second partial save REPLACES earlier answers instead of merging', Object.keys(p.filedOrFake.answers).length === 1, JSON.stringify(Object.keys(p.filedOrFake.answers).length));
  // foreign ids + extra keys
  r = await post({ answers: { ...fof, 'fake-x': true, '__proto__': true, constructor: false }, done: true, extra: 'x', score: 8 });
  p = await progress(u);
  check('foreign ids stored, or client-supplied score honoured (FoF done:true w/ foreign ids + extra keys)', Object.keys(p.filedOrFake.answers).some((k) => !ids.includes(k)) || r.body.score === 8, JSON.stringify(r.body));
  console.log(`info done:true w/ foreign ids+extra keys -> ${r.status} ${JSON.stringify(r.body)}`);

  // done:true with missing answers
  const u2 = await mk();
  const partial = Object.fromEntries(ids.slice(0, 7).map((k) => [k, fof[k]]));
  r = await api(u2, 'POST', '/results/filed-or-fake', { day: TODAY, answers: partial, done: true });
  p = await progress(u2);
  check('done:true with 7/8 answers marks game finished', p.filedOrFake.done === true, JSON.stringify(r.body));
  console.log(`info done:true with 7/8 answers -> ${r.status} ${JSON.stringify(r.body)}`);
  // 8 answers only from foreign ids
  r = await api(u2, 'POST', '/results/filed-or-fake', { day: TODAY, answers: { a: true }, done: true });
  check('done:true all-foreign answers finishes game', (await progress(u2)).filedOrFake.done === true);
  // type abuse
  for (const [label, body] of [['answers string value', { answers: { [ids[0]]: 'true' } }], ['answers array', { answers: [true] }], ['done string', { done: 'yes' }], ['answers null', { answers: null }], ['no day', null]]) {
    const rr = await api(u2, 'POST', '/results/filed-or-fake', body === null ? { answers: {} } : { day: TODAY, ...body });
    check(`FoF ${label} gives 5xx`, rr.status >= 500, `status=${rr.status} ${JSON.stringify(rr.body).slice(0, 80)}`);
  }
  // Oracle: done:false vs done:true gives score; partial save no score. does done:true with *all* answers wrong reveal? only once.
}
{
  // Wrong answers all 8 -> score 0; can the cheater probe score then redo? (no, finished) -- confirm via re-post
  const u = await mk();
  const t = await today(u);
  const fof = perfectFof(t);
  const bad = Object.fromEntries(Object.keys(fof).map((k) => [k, !fof[k]]));
  const r1 = await api(u, 'POST', '/results/filed-or-fake', { day: TODAY, answers: bad, done: true });
  const r2 = await api(u, 'POST', '/results/filed-or-fake', { day: TODAY, answers: fof, done: true });
  console.log(`info probe-then-redo: first score=${r1.body.score}, redo=${JSON.stringify(r2.body)}`);
  check('FoF can be redone after seeing a score', r2.body.alreadyFinished !== true);
}

// ---------------------------------------------------------------- 5. Landslide input abuse
{
  const u = await mk();
  const t = await today(u);
  const ids = t.landslide.items.map((i) => i.billId);
  const post = (order, x = {}) => api(u, 'POST', '/results/landslide', { day: TODAY, order, ...x });
  const expect400 = async (label, order) => {
    const r = await post(order);
    check(`Landslide ${label} accepted`, r.status === 200, `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
    check(`Landslide ${label} gives 5xx`, r.status >= 500, `status=${r.status}`);
  };
  await expect400('duplicate ids [a,a,b,c]', [ids[0], ids[0], ids[1], ids[2]]);
  await expect400('duplicate ids [a,a,b,b]', [ids[0], ids[0], ids[1], ids[1]]);
  await expect400('3 ids', ids.slice(0, 3));
  await expect400('5 ids', [...ids, ids[0]]);
  await expect400('5 ids (extra foreign)', [...ids, 'x']);
  await expect400('empty order', []);
  await expect400('ids from AK scope', sql(`select bill_id from daily_sets where day='${TODAY}' and game='landslide' and scope='AK'`).split('\n'));
  await expect400('numbers', [1, 2, 3, 4]);
  const r0 = await api(u, 'POST', '/results/landslide', { day: TODAY });
  check('Landslide no order accepted', r0.status === 200, `status=${r0.status}`);
  check('Landslide no order gives 5xx', r0.status >= 500);
  check('no landslide row created by rejected attempts', sql(`select count(*) from game_results where user_id='${u}' and game='landslide'`) !== '0');
  // comma-join bypass: pieces joined by comma look like 4 ids
  const u2 = await mk();
  const sid = [...ids].sort();
  const comma = [`${sid[0]},${sid[1]}`, sid[2], sid[3]];
  const rc = await api(u2, 'POST', '/results/landslide', { day: TODAY, order: comma });
  const pr = await progress(u2);
  check('Landslide accepts 3-item order built by comma-joining two ids (join() validation bypass)', rc.status === 200, `status=${rc.status} ${JSON.stringify(rc.body)} order=${JSON.stringify(pr.landslide.order)}`);
  // extra keys on landslide (done/answers ignored)
  const u3 = await mk();
  const t3 = await today(u3);
  const rx = await api(u3, 'POST', '/results/landslide', { day: TODAY, order: perfectLs(t3), score: 99, done: false, answers: { a: true } });
  check('Landslide: client-supplied score honoured', rx.body.score === 99, JSON.stringify(rx.body));
  check('Landslide: done:false respected (game left unfinished)', (await progress(u3)).landslide.done === false);
}

// ---------------------------------------------------------------- 6. Unknown game names / check-constraint collisions
{
  const u = await mk();
  const names = ['Roll-Call', 'roll-call ', ' roll-call', 'ROLL-CALL', 'roll_call', 'rollcall', 'filed-or-fake\u0000', '', 'landslide;', '__proto__', 'constructor', 'toString', 'roll-call/x', '%2e%2e', 'x'.repeat(5000), 'fi̇led-or-fake'];
  for (const g of names) {
    const r = await api(u, 'POST', `/results/${encodeURIComponent(g)}`, { day: TODAY, answers: {}, done: true, order: [] });
    check(`/results/${JSON.stringify(g).slice(0, 30)} gives 200 or 5xx`, r.status === 200 || r.status >= 500, `status=${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
  }
  check('no game_results rows from unknown game names', sql(`select count(*) from game_results where user_id='${u}'`) !== '0');
  // raw (unencoded) trailing-space & case variants of finished check
  const t = await today(u);
  await voteAll(u, t);
  await api(u, 'POST', '/results/roll-call', { day: TODAY });
  const r = await api(u, 'POST', '/results/Roll-Call', { day: TODAY });
  check('differently-cased game name bypasses finished lock', r.status === 200, JSON.stringify(r.body));
  console.log(`info rows: ${dbRows(u).replace(/\n/g, ' | ')}`);
}

// ---------------------------------------------------------------- 7. Races: un-finish / change after finish
{
  const u = await mk();
  const t = await today(u);
  const fof = perfectFof(t);
  let unfinished = 0;
  // Fire done:true alongside many done:false saves; if a done:false lands last it un-finishes the game.
  for (let round = 0; round < 6 && !unfinished; round++) {
    const v = await mk();
    const tv = await today(v);
    const f = perfectFof(tv);
    const reqs = [api(v, 'POST', '/results/filed-or-fake', { day: TODAY, answers: f, done: true })];
    for (let i = 0; i < 20; i++) reqs.push(api(v, 'POST', '/results/filed-or-fake', { day: TODAY, answers: {}, done: false }));
    await Promise.all(reqs);
    const p = await progress(v);
    const resp = (await Promise.all(reqs))[0];
    if (!p.filedOrFake.done && resp.body.score !== undefined && resp.body.score !== null) unfinished++;
  }
  check('RACE: concurrent done:true + done:false leaves game unfinished though a score was returned (read-then-upsert not atomic)', unfinished > 0, `rounds with un-finish=${unfinished}`);

  // Race: Roll Call finish vs vote flip vs reset
  let changed = 0;
  let wiped = 0;
  for (let round = 0; round < 12; round++) {
    const v = await mk();
    const tv = await today(v);
    await voteAll(v, tv, () => 'yea');
    const reqs = [api(v, 'POST', '/results/roll-call', { day: TODAY })];
    for (let i = 0; i < 10; i++) reqs.push(api(v, 'POST', '/votes', { day: TODAY, billId: tv.rollCall[0].id, vote: 'nay' }));
    for (let i = 0; i < 10; i++) reqs.push(api(v, 'POST', '/votes/reset', { day: TODAY }));
    await Promise.all(reqs);
    const fin = sql(`select score||':'||(finished_at is not null) from game_results where user_id='${v}' and game='roll-call'`);
    const nv = sql(`select count(*) from votes where user_id='${v}'`);
    if (fin.endsWith('true') && nv !== String(tv.rollCall.length)) wiped++;
    if (fin.endsWith('true')) {
      const stored = Number(fin.split(':')[0]);
      const actual = sql(`select count(*) from votes v join bills b on b.id=v.bill_id where v.user_id='${v}' and (v.vote='yea')=b.passed`);
      if (Number(actual) !== stored) changed++;
    }
  }
  check('RACE: Roll Call finished but votes wiped/changed afterwards (finished-check not atomic with write)', wiped > 0 || changed > 0, `votes-missing-rounds=${wiped} score-mismatch-rounds=${changed}`);
}

// ---------------------------------------------------------------- 8. ZIP hopping to pad votes / change set between games
{
  const u = await mk(AUSTIN);
  const tA = await today(u);
  await voteAll(u, tA); // all Austin-set votes, not finished
  await api(u, 'POST', '/me/location', { zip: LA });
  const tB = await today(u);
  const extraIds = tA.rollCall.filter((b) => !tB.rollCall.some((x) => x.id === b.id));
  await voteAll(u, tB);
  const fin = await api(u, 'POST', '/results/roll-call', { day: TODAY });
  const me = (await api(u, 'GET', '/me')).body.stats;
  console.log(`info hop: Austin set ${tA.rollCall.length} bills, LA set ${tB.rollCall.length}, extra TX-only bills ${extraIds.length}; finish=${JSON.stringify(fin.body)}; stats.billsVoted=${me.billsVoted}, rollCallsPlayed=${me.rollCallsPlayed}`);
  check('stats count votes on bills outside the finished set (billsVoted > set size) via ZIP hopping', me.billsVoted > tB.rollCall.length, `billsVoted=${me.billsVoted} vs set ${tB.rollCall.length}`);
  // switch ZIP between games: FoF in LA set, then Landslide in Austin set; max points still 25?
  await api(u, 'POST', '/results/filed-or-fake', { day: TODAY, answers: perfectFof(tB), done: true });
  await api(u, 'POST', '/me/location', { zip: AUSTIN });
  const tA2 = await today(u);
  await api(u, 'POST', '/results/landslide', { day: TODAY, order: perfectLs(tA2) });
  const pts = await points(u);
  check('hopping ZIPs between games lifts points above 25', pts > 25, `points=${pts}`);
  const pr = await progress(u);
  console.log(`info after hop back to Austin: progress.rollCall.revealed=${pr.rollCall.revealed} agreed=${pr.rollCallAgreed} fof=${JSON.stringify(pr.filedOrFake.done)}/${pr.filedOrFake.score}`);
}

// ---------------------------------------------------------------- 9. Global points ceiling over everything in the QA DB
{
  const rows = sql(`select user_id, day, sum(case when game='roll-call' then 5 else coalesce(score,0) end) as pts, count(*) from game_results where finished_at is not null group by 1,2 having sum(case when game='roll-call' then 5 else coalesce(score,0) end) > 25`);
  check('any user-day with POINTS_SQL total above 25 in DB', rows !== '', rows.split('\n').slice(0, 3).join(' ; '));
  const bad = sql(`select count(*) from game_results where game='filed-or-fake' and score>8 or game='landslide' and score>12`);
  check('any stored FoF score >8 or Landslide >12', bad !== '0', `rows=${bad}`);
  // leaderboard area endpoints respond within bounds
  const u = await mk();
  for (const s of ['all', 'state', 'city', 'bogus']) {
    const r = await api(u, 'GET', `/leaderboard/area/${s}`);
    console.log(`info /leaderboard/area/${s} -> ${r.status} ${JSON.stringify(r.body).slice(0, 120)}`);
  }
}
