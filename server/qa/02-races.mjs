// Race-condition probes for the Docket API. Run: node 02-races.mjs [section...]  (sections: acct games roll groups friends)
import { api, sql, check, RUN } from './lib.mjs';

const P = `race-${RUN}`;
const only = process.argv.slice(2);
const want = (s) => only.length === 0 || only.includes(s);
const par = (fns) => Promise.all(fns.map((f) => f()));
const rows = (t) => (t ? t.split('\n').map((l) => l.split('|')) : []);
const esc = (s) => s.replace(/'/g, "''");
const count = (arr, f) => arr.filter(f).length;

async function newUser(tag) {
  const uid = `${P}-${tag}`;
  await api(uid, 'POST', '/me/location', { zip: '77002' });
  return uid;
}
const mk = (n, tag) => Promise.all(Array.from({ length: n }, (_, i) => newUser(`${tag}${i}`)));

// ---------------------------------------------------------------- account creation burst
if (want('acct')) {
  const N = 8, B = 40;
  const results = await Promise.all(
    Array.from({ length: N }, (_, i) =>
      Promise.all(Array.from({ length: B }, (_, j) => api(`${P}-acct${i}`, j % 2 ? 'GET' : 'POST', j % 2 ? '/me' : '/groups', j % 2 ? undefined : { name: 'Burst group ' + i }))),
    ),
  );
  const flat = results.flat();
  const hist = {};
  for (const r of flat) hist[r.status] = (hist[r.status] ?? 0) + 1;
  console.log('info acct burst status histogram', JSON.stringify(hist));
  const bad = count(flat, (r) => r.status >= 500 || r.status === 401);
  check('acct: first-request burst for brand-new uid yields 5xx/401', bad > 0, `${bad}/${flat.length} bad of ${N} fresh uids x ${B} parallel`);
  const ng = sql(`SELECT count(*) FROM users WHERE id LIKE '${P}-acct%'`);
  check('acct: exactly one user row per uid', Number(ng) !== N, `${ng} rows for ${N} uids`);
}

// ---------------------------------------------------------------- games: filed-or-fake / landslide
if (want('games')) {
  const day = (await api(await newUser('probe'), 'GET', '/today')).body;
  const fof = day.filedOrFake;
  const right = Object.fromEntries(fof.map((c) => [c.id, c.real]));
  const wrong = Object.fromEntries(fof.map((c) => [c.id, !c.real]));
  const D = day.day;
  const prog = async (u) => (await api(u, 'GET', '/results/today')).body;

  // A. done:true racing done:false. Player gets score from the done:true response, but finished_at ends NULL.
  {
    const N = 40;
    const users = await mk(N, 'fofA');
    const out = await Promise.all(
      users.map(async (u) => {
        const [a, b] = await Promise.all([
          api(u, 'POST', '/results/filed-or-fake', { day: D, answers: wrong, done: true }),
          api(u, 'POST', '/results/filed-or-fake', { day: D, answers: wrong, done: false }),
        ]);
        const p = await prog(u);
        return { u, a, b, p };
      }),
    );
    const reopened = out.filter((o) => o.a.body.score !== undefined && o.a.body.score !== null && !o.p.filedOrFake.done);
    check('fof: done:true score returned but game ends UNFINISHED (done:false overwrote)', reopened.length > 0, `${reopened.length}/${N} bursts`);
    // exploit: replay with right answers after seeing reveal
    let replayed = 0, flipped = 0;
    for (const o of reopened) {
      const r = await api(o.u, 'POST', '/results/filed-or-fake', { day: D, answers: right, done: true });
      if (!r.body.alreadyFinished) replayed++;
      const p = await prog(o.u);
      if (p.filedOrFake.score !== o.a.body.score) flipped++;
    }
    check('fof: unfinished-by-race game can be replayed with better answers, stored score changes', replayed > 0 && flipped > 0, `${replayed}/${reopened.length} accepted a replay, ${flipped} scores differ from the one first shown (was ${out[0]?.a.body.score} -> ${fof.length})`);
    check('fof: sequential resubmit after finish is blocked (guard works when not racing)', await (async () => {
      const u = await newUser('fofSeq');
      await api(u, 'POST', '/results/filed-or-fake', { day: D, answers: wrong, done: true });
      const r = await api(u, 'POST', '/results/filed-or-fake', { day: D, answers: right, done: true });
      return !r.body.alreadyFinished;
    })(), 'baseline');
  }

  // B. Same, 5 parallel submissions mixing done:true/false, odd counts of each.
  {
    const N = 30;
    const users = await mk(N, 'fofB');
    let unfinished = 0, scoreMismatch = 0, fivexx = 0;
    await Promise.all(
      users.map(async (u) => {
        const rs = await Promise.all([
          api(u, 'POST', '/results/filed-or-fake', { day: D, answers: wrong, done: true }),
          api(u, 'POST', '/results/filed-or-fake', { day: D, answers: right, done: true }),
          api(u, 'POST', '/results/filed-or-fake', { day: D, answers: right, done: false }),
          api(u, 'POST', '/results/filed-or-fake', { day: D, answers: wrong, done: true }),
          api(u, 'POST', '/results/filed-or-fake', { day: D, answers: right, done: true }),
        ]);
        fivexx += count(rs, (r) => r.status >= 500);
        const scores = new Set(rs.filter((r) => r.body.score !== undefined && r.body.score !== null).map((r) => r.body.score));
        const p = await prog(u);
        if (!p.filedOrFake.done) unfinished++;
        if (scores.size > 1) scoreMismatch++; // user was shown two different final scores for one game
      }),
    );
    check('fof: 5-way mixed burst leaves game unfinished', unfinished > 0, `${unfinished}/${N}`);
    check('fof: 5-way burst returns several different "final" scores for one game (only one is stored)', scoreMismatch > 0, `${scoreMismatch}/${N} (5xx: ${fivexx})`);
  }

  // C. Landslide: two different orders in parallel, both told "ok + score".
  {
    const ids = day.landslide.items.map((i) => i.billId);
    const ans = [...day.landslide.items].sort((a, b) => b.yeas - b.nays - (a.yeas - a.nays)).map((i) => i.billId);
    const worst = [...ans].reverse();
    const N = 40;
    const users = await mk(N, 'ls');
    let both = 0, diffScores = 0, stored = 0;
    await Promise.all(
      users.map(async (u) => {
        const [a, b] = await Promise.all([
          api(u, 'POST', '/results/landslide', { day: D, order: worst }),
          api(u, 'POST', '/results/landslide', { day: D, order: ans }),
        ]);
        if (a.status === 200 && b.status === 200 && !a.body.alreadyFinished && !b.body.alreadyFinished) {
          both++;
          if (a.body.score !== b.body.score) diffScores++;
        }
        const p = await prog(u);
        if (p.landslide.score !== undefined) stored++;
      }),
    );
    check('landslide: two parallel orders both accepted as the first/final answer', both > 0, `${both}/${N} bursts; ${diffScores} showed two different scores; ${stored} stored`);
  }
}

// ---------------------------------------------------------------- roll call vs votes
if (want('roll')) {
  const day = (await api(await newUser('probe'), 'GET', '/today')).body;
  const D = day.day;
  const bills = day.rollCall;
  const expected = (votesByBill) => bills.filter((b) => (votesByBill[b.id] === 'yea') === b.passed).length;
  const allVotes = (v) => Object.fromEntries(bills.map((b) => [b.id, v]));

  // A. votes flipping while roll call is submitted
  {
    const N = 30;
    const users = await mk(N, 'rcA');
    let changedAfterLock = 0, scoreStale = 0, flips5xx = 0, errs = new Set();
    await Promise.all(
      users.map(async (u) => {
        for (const b of bills) await api(u, 'POST', '/votes', { day: D, billId: b.id, vote: 'yea' });
        const rs = await Promise.all([
          api(u, 'POST', '/results/roll-call', { day: D }),
          ...bills.map((b) => api(u, 'POST', '/votes', { day: D, billId: b.id, vote: 'nay' })),
        ]);
        for (const r of rs) { if (r.status >= 500) flips5xx++; if (r.status >= 400) errs.add(r.status + ':' + (r.body.error ?? '')); }
        const [res] = rows(sql(`SELECT score, to_char(finished_at,'YYYY-MM-DD HH24:MI:SS.US') FROM game_results WHERE user_id='${esc(u)}' AND day='${D}' AND game='roll-call'`));
        if (!res) return;
        const v = Object.fromEntries(rows(sql(`SELECT bill_id, vote FROM votes WHERE user_id='${esc(u)}' AND day='${D}'`)));
        if (Number(res[0]) !== expected(v)) scoreStale++;
        // The player saw `res.score` (computed from the yea votes the server read); the votes table now says nay.
        const h = (await api(u, 'GET', '/me/history/roll-call')).body.days?.find((d) => d.day === D);
        if (h && h.bills && h.score !== h.bills.filter((x) => x.agreed).length) changedAfterLock++;
      }),
    );
    check('roll: history screen shows score X but per-bill rows (from live votes) add up to a different number', changedAfterLock > 0, `${changedAfterLock}/${N}`);
    check('roll: stored roll-call score != score recomputed from final votes', scoreStale > 0, `${scoreStale}/${N} (5xx ${flips5xx}; statuses seen: ${[...errs].join(' | ')})`);
  }

  // B. votes/reset racing roll-call: finished with zero (or fewer than all) votes on file. Reset is staggered 0-12ms after.
  {
    const offsets = [0, 1, 2, 3, 4, 6, 8, 12];
    const per = 6;
    const users = await mk(offsets.length * per, 'rcB');
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let lockedNoVotes = 0, partial = 0, consistent = 0;
    const byOffset = {};
    await Promise.all(
      users.map(async (u, idx) => {
        const off = offsets[idx % offsets.length];
        for (const b of bills) await api(u, 'POST', '/votes', { day: D, billId: b.id, vote: 'yea' });
        await Promise.all([api(u, 'POST', '/results/roll-call', { day: D }), sleep(off).then(() => api(u, 'POST', '/votes/reset', { day: D }))]);
        const fin = sql(`SELECT count(*) FROM game_results WHERE user_id='${esc(u)}' AND day='${D}' AND game='roll-call' AND finished_at IS NOT NULL`);
        const nv = Number(sql(`SELECT count(*) FROM votes WHERE user_id='${esc(u)}' AND day='${D}'`));
        if (Number(fin) === 1 && nv === 0) { lockedNoVotes++; byOffset[off] = (byOffset[off] ?? 0) + 1; }
        else if (Number(fin) === 1 && nv < bills.length) partial++;
        else consistent++;
      }),
    );
    check('roll: Roll Call finished (5 pts on leaderboard) with ZERO votes on file after reset race', lockedNoVotes > 0, `${lockedNoVotes}/${users.length} (by reset delay ms: ${JSON.stringify(byOffset)}), partial ${partial}, consistent ${consistent}`);
  }
}

// ---------------------------------------------------------------- groups
if (want('groups')) {
  const fill = (gid, uids, status = 'active') => {
    const vals = uids.map((u) => `('${esc(u)}')`).join(',');
    sql(`INSERT INTO users (id) VALUES ${vals} ON CONFLICT DO NOTHING`);
    sql(`INSERT INTO group_members (group_id, user_id, status) SELECT '${gid}', v, '${status}' FROM unnest(ARRAY[${uids.map((u) => `'${esc(u)}'`).join(',')}]) v ON CONFLICT DO NOTHING`);
  };
  const activeCount = (gid) => Number(sql(`SELECT count(*) FROM group_members WHERE group_id='${gid}' AND status='active'`));

  // A. join from empty with 55 parallel joiners
  {
    const admin = await newUser('gA-admin');
    const g = (await api(admin, 'POST', '/groups', { name: 'Race Open' })).body;
    const joiners = Array.from({ length: 55 }, (_, i) => `${P}-gA-j${i}`);
    const rs = await Promise.all(joiners.map((u) => api(u, 'POST', '/groups/join', { code: g.code })));
    const n = activeCount(g.id);
    check('groups: 55 parallel joins to empty group exceed MAX_MEMBERS=50', n > 50, `active=${n} (status: ${JSON.stringify(rs.reduce((h, r) => ((h[r.status] = (h[r.status] ?? 0) + 1), h), {}))})`);
  }
  // B. prefilled to 45, 40 parallel joiners for 5 free slots
  {
    const admin = await newUser('gB-admin');
    const g = (await api(admin, 'POST', '/groups', { name: 'Race Near Full' })).body;
    fill(g.id, Array.from({ length: 44 }, (_, i) => `${P}-gB-pre${i}`));
    const joiners = Array.from({ length: 40 }, (_, i) => `${P}-gB-j${i}`);
    const rs = await Promise.all(joiners.map((u) => api(u, 'POST', '/groups/join', { code: g.code })));
    const n = activeCount(g.id);
    const ok = count(rs, (r) => r.status === 200);
    check('groups: 40 parallel joins into 5 free slots overfill the group', n > 50, `active=${n}, 200s=${ok}, 409s=${count(rs, (r) => r.status === 409)}`);
  }
  // C. same user joins 30x in parallel -> PK violation 500s
  {
    const admin = await newUser('gC-admin');
    const g = (await api(admin, 'POST', '/groups', { name: 'Race Dup' })).body;
    const u = `${P}-gC-dup`;
    await api(u, 'GET', '/me');
    const rs = await Promise.all(Array.from({ length: 30 }, () => api(u, 'POST', '/groups/join', { code: g.code })));
    const s5 = count(rs, (r) => r.status >= 500);
    check('groups: one user double-tapping Join in parallel gets 500', s5 > 0, `${s5}/30 were 5xx; first 5xx body: ${JSON.stringify(rs.find((r) => r.status >= 500)?.body)}`);
    const m = sql(`SELECT count(*) FROM group_members WHERE group_id='${g.id}' AND user_id='${esc(u)}'`);
    check('groups: duplicate member rows', Number(m) > 1, `${m} rows`);
  }
  // D. approvals past 50
  {
    const admin = await newUser('gD-admin');
    const g = (await api(admin, 'POST', '/groups', { name: 'Race Approve', approvalRequired: true })).body;
    fill(g.id, Array.from({ length: 44 }, (_, i) => `${P}-gD-act${i}`));
    const pend = Array.from({ length: 30 }, (_, i) => `${P}-gD-p${i}`);
    fill(g.id, pend, 'pending');
    const rs = await Promise.all(pend.map((u) => api(admin, 'POST', `/groups/${g.id}/members/${encodeURIComponent(u)}/approve`)));
    const n = activeCount(g.id);
    check('groups: 30 parallel approvals with 5 free slots exceed MAX_MEMBERS', n > 50, `active=${n}, 200s=${count(rs, (r) => r.status === 200)}, 409s=${count(rs, (r) => r.status === 409)}`);
  }
  // E. join racing approval/ approval-required join + parallel approve + joiner while full (mixed)
  {
    const admin = await newUser('gE-admin');
    const g = (await api(admin, 'POST', '/groups', { name: 'Race Mixed' })).body;
    fill(g.id, Array.from({ length: 48 }, (_, i) => `${P}-gE-act${i}`));
    const pend = Array.from({ length: 10 }, (_, i) => `${P}-gE-p${i}`);
    fill(g.id, pend, 'pending');
    const joiners = Array.from({ length: 10 }, (_, i) => `${P}-gE-j${i}`);
    await Promise.all([
      ...pend.map((u) => api(admin, 'POST', `/groups/${g.id}/members/${encodeURIComponent(u)}/approve`)),
      ...joiners.map((u) => api(u, 'POST', '/groups/join', { code: g.code })),
    ]);
    const n = activeCount(g.id);
    check('groups: mixed approve + join burst overfills', n > 50, `active=${n}`);
  }
}

// ---------------------------------------------------------------- friends / invites
if (want('friends')) {
  const named = async (tag) => {
    const uid = `${P}-${tag}`;
    const uname = `r${RUN.slice(-5)}${tag}`.replace(/[^a-z0-9_]/g, '').slice(0, 20).toLowerCase();
    await api(uid, 'GET', '/me');
    await api(uid, 'PATCH', '/me', { username: uname });
    return { uid, uname };
  };
  const pairIds = (a, b) => (a < b ? [a, b] : [b, a]);
  const friendsRows = (a, b) => { const [x, y] = pairIds(a, b); return Number(sql(`SELECT count(*) FROM friendships WHERE user_a='${esc(x)}' AND user_b='${esc(y)}'`)); };

  // A. requests both ways at once
  {
    const N = 20;
    let bothPending = 0, dupPending = 0, s5 = 0;
    await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const [a, b] = await Promise.all([named(`fA${i}a`), named(`fA${i}b`)]);
        const rs = await Promise.all([
          ...Array.from({ length: 5 }, () => api(a.uid, 'POST', '/friend-requests', { username: b.uname })),
          ...Array.from({ length: 5 }, () => api(b.uid, 'POST', '/friend-requests', { username: a.uname })),
        ]);
        s5 += count(rs, (r) => r.status >= 500);
        const ab = Number(sql(`SELECT count(*) FROM friend_requests WHERE from_id='${esc(a.uid)}' AND to_id='${esc(b.uid)}' AND status='pending'`));
        const ba = Number(sql(`SELECT count(*) FROM friend_requests WHERE from_id='${esc(b.uid)}' AND to_id='${esc(a.uid)}' AND status='pending'`));
        if (ab && ba) bothPending++;
        if (ab > 1 || ba > 1) dupPending++;
      }),
    );
    check('friends: A->B and B->A requests at once leave two crossing pending requests (never auto-friend)', bothPending > 0, `${bothPending}/${N} pairs (5xx: ${s5}, dup same-direction pending: ${dupPending})`);
  }

  // B. accept racing ignore
  {
    const N = 25;
    let friendAndIgnored = 0, bothOk = 0, s5 = 0;
    await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const [a, b] = await Promise.all([named(`fB${i}a`), named(`fB${i}b`)]);
        await api(a.uid, 'POST', '/friend-requests', { username: b.uname });
        const reqs = (await api(b.uid, 'GET', '/friends')).body.requests;
        const id = reqs[0]?.id;
        if (!id) return;
        const [x, y] = await Promise.all([api(b.uid, 'POST', `/friend-requests/${id}/accept`), api(b.uid, 'POST', `/friend-requests/${id}/ignore`)]);
        s5 += count([x, y], (r) => r.status >= 500);
        if (x.status === 200 && y.status === 200) bothOk++;
        const st = sql(`SELECT status FROM friend_requests WHERE id=${id}`);
        if (friendsRows(a.uid, b.uid) === 1 && st === 'ignored') friendAndIgnored++;
      }),
    );
    check('friends: accept+ignore both return 200; ends friends yet request marked "ignored"', friendAndIgnored > 0, `${friendAndIgnored}/${N} inconsistent, ${bothOk}/${N} both-200, 5xx ${s5}`);
  }

  // C. accept racing block (friendship survives block)
  {
    const N = 30;
    let friendAndBlocked = 0, s5 = 0;
    await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const [a, b] = await Promise.all([named(`fC${i}a`), named(`fC${i}b`)]);
        await api(a.uid, 'POST', '/friend-requests', { username: b.uname });
        const id = (await api(b.uid, 'GET', '/friends')).body.requests[0]?.id;
        if (!id) return;
        const rs = await Promise.all([api(b.uid, 'POST', `/friend-requests/${id}/accept`), api(a.uid, 'POST', '/blocks', { userId: b.uid })]);
        s5 += count(rs, (r) => r.status >= 500);
        const blocked = Number(sql(`SELECT count(*) FROM blocks WHERE blocker_id='${esc(a.uid)}' AND blocked_id='${esc(b.uid)}'`));
        if (blocked && friendsRows(a.uid, b.uid) === 1) friendAndBlocked++;
      }),
    );
    check('friends: block racing accept leaves a blocked pair that is still friends', friendAndBlocked > 0, `${friendAndBlocked}/${N} (5xx ${s5})`);
  }

  // D. invite accept by many; invite creation race; invite accept racing undo/block
  {
    const host = await named('fDhost');
    const toks = await Promise.all(Array.from({ length: 20 }, () => api(host.uid, 'POST', '/invites')));
    const distinct = new Set(toks.map((t) => t.body.token)).size;
    const live = Number(sql(`SELECT count(*) FROM invites WHERE inviter_id='${esc(host.uid)}' AND NOT revoked`));
    check('invites: 20 parallel POST /invites for a new user create several live tokens (one per user intended)', live > 1, `distinct returned=${distinct}, live rows=${live}, 5xx=${count(toks, (t) => t.status >= 500)}`);
    const token = toks[0].body.token;
    const guests = Array.from({ length: 45 }, (_, i) => `${P}-fD-g${i}`);
    const rs = await Promise.all(guests.map((u) => api(u, 'POST', `/invites/${token}/accept`, { via: 'link' })));
    const fr = Number(sql(`SELECT count(*) FROM friendships WHERE user_a='${esc(host.uid)}' OR user_b='${esc(host.uid)}'`));
    check('invites: 45 parallel accepts by fresh users produce 45 friendships, no 5xx', count(rs, (r) => r.status >= 500) > 0 || fr !== 45, `friendships=${fr}, statuses=${JSON.stringify(rs.reduce((h, r) => ((h[r.status] = (h[r.status] ?? 0) + 1), h), {}))}`);
    // same guest accepts 20x in parallel
    const g = `${P}-fD-same`;
    await api(g, 'GET', '/me');
    const rr = await Promise.all(Array.from({ length: 20 }, () => api(g, 'POST', `/invites/${token}/accept`)));
    const falseAlready = count(rr, (r) => r.status === 200 && r.body.alreadyFriends === false);
    check('invites: same user accepting 20x in parallel gets alreadyFriends:false many times (UI shows "now friends" repeatedly)', falseAlready > 1, `${falseAlready}/20 said alreadyFriends:false, friendship rows=${friendsRows(host.uid, g)}`);
  }
  // E. invite accept racing block by inviter
  {
    const N = 30;
    let friendAndBlocked = 0;
    await Promise.all(
      Array.from({ length: N }, async (_, i) => {
        const host = await named(`fE${i}h`);
        const guest = `${P}-fE${i}g`;
        await api(guest, 'GET', '/me');
        const token = (await api(host.uid, 'POST', '/invites')).body.token;
        await Promise.all([api(guest, 'POST', `/invites/${token}/accept`), api(host.uid, 'POST', '/blocks', { userId: guest })]);
        const blocked = Number(sql(`SELECT count(*) FROM blocks WHERE blocker_id='${esc(host.uid)}' AND blocked_id='${esc(guest)}'`));
        if (blocked && friendsRows(host.uid, guest) === 1) friendAndBlocked++;
      }),
    );
    check('invites: invite accept racing inviter\'s block leaves blocked pair friends', friendAndBlocked > 0, `${friendAndBlocked}/${N}`);
  }
}
