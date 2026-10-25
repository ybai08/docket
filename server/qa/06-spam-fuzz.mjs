// Spammer / fuzzer persona. Run: node 06-spam-fuzz.mjs   (local QA API only; uid prefix "spam")
import { BASE, RUN, api, check, player, sql } from './lib.mjs';

const P = `spam-${RUN}`;
const u = (n) => `${P}-${n}`;
const short = RUN.slice(-6).replace(/[^a-z0-9]/g, 'x');
const uname = (n) => `sp${short}${n}`.slice(0, 20);

/** Raw request: explicit content-type / body / header control, with a timeout so hangs show up. */
async function raw(uid, method, path, body, { ctype = 'application/json', auth, timeout = 20000 } = {}) {
  const headers = {};
  if (auth !== null) headers.authorization = auth ?? `Bearer ${uid}`;
  if (ctype) headers['content-type'] = ctype;
  const t0 = Date.now();
  try {
    const res = await fetch(BASE + path, { method, headers, body, signal: AbortSignal.timeout(timeout) });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = text.slice(0, 200); }
    return { status: res.status, body: json, ms: Date.now() - t0 };
  } catch (e) {
    return { status: 0, body: String(e.cause?.code ?? e.name), ms: Date.now() - t0 };
  }
}
const s = (r) => `${r.status} ${JSON.stringify(r.body).slice(0, 90)}`;

const me = await player(u('main'), { username: uname('m') });
const victim = await player(u('vic'), { username: uname('v'), displayName: 'Victoria Real' });

// ---------- A. malformed bodies must be 4xx, never 5xx / hang ----------
const endpoints = [
  ['PATCH', '/me'], ['PATCH', '/settings'], ['POST', '/me/location'], ['POST', '/votes'], ['POST', '/votes/reset'],
  ['POST', '/results/roll-call'], ['POST', '/results/filed-or-fake'], ['POST', '/results/landslide'], ['POST', '/blocks'],
  ['POST', '/groups'], ['POST', '/groups/join'], ['POST', '/friend-requests'], ['PUT', `/friends/${victim}/sharing`],
];
const badBodies = {
  'malformed-json': ['{"a":', 'application/json'],
  'empty-body-json-ctype': ['', 'application/json'],
  'text-plain': ['hello', 'text/plain'],
  'form-urlencoded': ['a=b', 'application/x-www-form-urlencoded'],
  'json-null': ['null', 'application/json'],
  'json-array': ['[]', 'application/json'],
  'json-number': ['42', 'application/json'],
  'json-string': ['"x"', 'application/json'],
};
for (const [label, [body, ctype]] of Object.entries(badBodies)) {
  const bad = [];
  for (const [m, p] of endpoints) {
    const r = await raw(me, m, p, body, { ctype });
    if (r.status >= 500 || r.status === 0) bad.push(`${m} ${p}=${r.status}`);
  }
  check(`A ${label} body -> 5xx/hang on some endpoints`, bad.length > 0, bad.length ? `${bad.length}/${endpoints.length}: ${bad.slice(0, 3).join(', ')}` : '');
}
{
  const r = await raw(me, 'POST', '/friend-requests', '{"username":', { ctype: 'application/json' });
  check('A malformed JSON gives 500 "Something went wrong" instead of 400', r.status === 500, s(r));
  const r2 = await raw(me, 'POST', '/friend-requests', 'username=x', { ctype: 'application/x-www-form-urlencoded' });
  check('A unsupported content-type gives 500 instead of 415', r2.status === 500, s(r2));
  const r2b = await raw(me, 'POST', '/friend-requests', '{"__proto__":{"a":1},"username":"x"}');
  check('A JSON containing a "__proto__" key gives 500 instead of 400', r2b.status === 500, s(r2b));
}
// unauthenticated malformed request: still 401 expected
{
  const r = await raw(me, 'POST', '/friend-requests', '{bad', { auth: null });
  check('A unauthenticated malformed JSON is 401 (auth before parse)?', r.status !== 401, s(r));
}

// ---------- A2. size limits ----------
for (const [label, mb] of [['1.1MB', 1.1], ['10MB', 10]]) {
  const body = JSON.stringify({ displayName: 'x', pad: 'a'.repeat(Math.floor(mb * 1024 * 1024)) });
  const r = await raw(me, 'PATCH', '/me', body);
  check(`A2 ${label} body: expect 413`, r.status !== 413, s(r) + ` ${r.ms}ms`);
}
{
  // 12 issues x 500KB = 6MB: over bodyLimit
  const issues = Array.from({ length: 12 }, () => 'a'.repeat(500 * 1024));
  const r = await raw(me, 'PATCH', '/me', JSON.stringify({ issues }));
  check('A2 issues 12x500KB: expect 413', r.status !== 413, s(r) + ` ${r.ms}ms`);
  // 12 x 80KB fits under 1MB: server stores it?
  const issues2 = Array.from({ length: 12 }, () => 'b'.repeat(80 * 1024));
  const r2 = await raw(me, 'PATCH', '/me', JSON.stringify({ issues: issues2 }));
  const stored = sql(`SELECT sum(length(x)) FROM users, unnest(issues) x WHERE id='${me}'`);
  check('A2 issues entries have no length cap (960KB stored in one profile row)', Number(stored) > 100000, `status ${r2.status}, stored chars ${stored}`);
  const g = await api(me, 'GET', '/me');
  check('A2 every GET /me now returns ~1MB (amplification)', JSON.stringify(g.body).length > 500000, `${JSON.stringify(g.body).length} bytes`);
  await api(me, 'PATCH', '/me', { issues: [] });
}
{
  const deep = '['.repeat(400000) + ']'.repeat(400000);
  const r = await raw(me, 'PATCH', '/me', deep);
  check('A2 deeply nested JSON (400k) -> not 5xx/hang', r.status >= 500 || r.status === 0, s(r) + ` ${r.ms}ms`);
  const deepObj = '{"a":'.repeat(100000) + '1' + '}'.repeat(100000);
  const r2 = await raw(me, 'PATCH', '/me', deepObj);
  check('A2 deeply nested object (100k) -> not 5xx/hang', r2.status >= 500 || r2.status === 0, s(r2) + ` ${r2.ms}ms`);
}

// ---------- A3. prototype keys ----------
{
  const day = (await api(me, 'GET', '/today')).body.day;
  const t = (await api(me, 'GET', '/today')).body;
  const ids = t.filedOrFake.map((c) => c.id);
  const body = `{"day":"${day}","answers":{"__proto__":true,"constructor":false,"toString":true,"${ids[0]}":true},"done":true}`;
  const r = await raw(me, 'POST', '/results/filed-or-fake', body);
  check('A3 __proto__/constructor keys in answers -> no 5xx', r.status >= 500, s(r));
  const r2 = await raw(me, 'PATCH', '/me', '{"__proto__":{"admin":true},"constructor":{"prototype":{"x":1}},"displayName":"ok"}');
  check('A3 __proto__ in PATCH /me -> no 5xx', r2.status >= 500, s(r2));
  const probe = await api(me, 'GET', '/health');
  check('A3 server still healthy / Object.prototype not polluted', JSON.stringify(probe.body) !== '{"ok":true}');
  const g = await api(me, 'GET', '/today');
  check('A3 partial FoF save with proto keys does not store them', JSON.stringify(g.body.progress.filedOrFake.answers).includes('__proto__'), JSON.stringify(g.body.progress.filedOrFake));
  await api(me, 'POST', '/votes/reset', { day });
}

// ---------- B. names ----------
const nameTests = {
  'NUL \\u0000': 'a\u0000b',
  'lone surrogate': 'a\ud800b',
  'RLO U+202E': '‮evilname',
  'zero-width only': '​​​',
  'spaces only': '     ',
  'newline':'line1\nline2\r\n\tx',
  '<script>': '<script>alert(1)</script>',
  'emoji x30 (60 UTF-16 units)': '\u{1F600}'.repeat(30),
  'emoji x31 (62 units)': '\u{1F600}'.repeat(31),
  '@victim lookalike': `@${uname('v')}`,
  'zalgo': 'Z' + '̶́҉'.repeat(19),
};
for (const [label, name] of Object.entries(nameTests)) {
  const r = await api(me, 'PATCH', '/me', { displayName: name });
  const bug500 = r.status >= 500;
  const blank = r.status === 200 && !/[^\s​-‏‪-‮⁠﻿]/.test(r.body.profile.displayName);
  const stored = r.status === 200 && r.body.profile.displayName === name;
  check(`B displayName ${label}: no 5xx`, bug500, s(r));
  if (['RLO U+202E', 'zero-width only', 'spaces only', 'newline'].includes(label))
    check(`B displayName ${label}: control/invisible chars stored unsanitised`, stored, stored ? 'stored verbatim' : '');
  if (blank) check(`B displayName ${label}: blank/invisible name accepted`, true, JSON.stringify(r.body.profile.displayName));
}
await api(me, 'PATCH', '/me', { displayName: 'Spam Main' });

// "You" impersonation + lookalike of a real friend's name, seen by an observer
{
  const obs = await player(u('obs'), { username: uname('o'), displayName: 'Observer' });
  const imp = await player(u('imp'), { username: uname('i'), displayName: 'You' });
  const dup = await player(u('dup'), { username: uname('d'), displayName: 'Victoria Real' });
  for (const x of [imp, dup, victim]) {
    await api(obs, 'POST', '/friend-requests', { username: x === imp ? uname('i') : x === dup ? uname('d') : uname('v') });
    const reqs = (await api(x, 'GET', '/friends')).body; void reqs;
  }
  // targets accept: needs their requests list; the requests go TO them. Reverse: they request obs, obs accepts.
  for (const x of [imp, dup, victim]) await api(x, 'POST', '/friend-requests', { username: uname('o') });
  const pend = (await api(obs, 'GET', '/friends')).body.requests;
  check('B friend-request list shows only displayName (impersonator "Victoria Real" indistinguishable)', pend.filter((q) => q.from.name === 'Victoria Real').length === 2, JSON.stringify(pend.map((q) => q.from.name)));
  for (const q of pend) await api(obs, 'POST', `/friend-requests/${q.id}/accept`);
  const f = (await api(obs, 'GET', '/friends')).body;
  const yous = f.leaderboard.board.filter((b) => b.name === 'You');
  check('B displayName "You": another player appears as "You" on viewer leaderboard (two rows named You)', yous.length > 1, JSON.stringify(f.leaderboard.board.map((b) => `${b.name}${b.isYou ? '*' : ''}`)));
  check('B friends list: two friends with identical name, no username/handle to tell apart', f.friends.filter((x) => x.name === 'Victoria Real').length === 2 && !('username' in f.friends[0]), JSON.stringify(f.friends.map((x) => x.name)));
  // group board
  const gr = await api(obs, 'POST', '/groups', { name: 'Spam Group' });
  await api(imp, 'POST', '/groups/join', { code: gr.body.code });
  const gd = (await api(obs, 'GET', `/groups/${gr.body.id}`)).body;
  check('B group board: impersonator named "You" shown as "You"', gd.board.filter((b) => b.name === 'You').length > 1, JSON.stringify(gd.board.map((b) => `${b.name}${b.isYou ? '*' : ''}`)));
  // no-name users: label for display_name '@x' vs username
  const me2 = (await api(obs, 'GET', '/friends/' + imp)).body;
  check('B /friends/:id reveals no username for disambiguation', !('username' in me2), JSON.stringify(Object.keys(me2)));
}

// ---------- B2. usernames ----------
{
  const bads = ['Upper', 'ALLCAPS_1', "'; DROP TABLE users;--", 'ab', 'a'.repeat(21), 'caféx', 'аdmin' /* cyrillic a */, 'name\n', ' name', 'na me', 'ａｂｃ', 'a\u0000bc', 'x'.repeat(100000)];
  const accepted = [];
  for (const nme of bads) {
    const r = await raw(me, 'PATCH', '/me', JSON.stringify({ username: nme }));
    if (r.status === 200 || r.status >= 500) accepted.push(`${JSON.stringify(nme).slice(0, 25)}=${r.status}`);
  }
  check('B2 invalid usernames rejected (4xx) — none accepted/5xx', accepted.length > 0, accepted.join(' | '));
  await api(me, 'PATCH', '/me', { username: uname('m') });
  const reserved = ['admin', 'docket', 'support', 'official', 'moderator'];
  const got = [];
  for (const nme of reserved) {
    const x = await player(u('res' + nme), {});
    const r2 = await api(x, 'PATCH', '/me', { username: nme + short });
    if (r2.status === 200) got.push(nme);
    await api(x, 'PATCH', '/me', { username: nme }).then((rr) => { if (rr.status === 200) got.push(`EXACT:${nme}`); });
  }
  check('B2 reserved-looking usernames (admin/docket/support...) claimable', got.some((g) => g.startsWith('EXACT')), got.join(','));
  // cleanup exact claims
  for (const nme of reserved) { try { sql(`UPDATE users SET username=NULL WHERE id='${u('res' + nme)}'`); } catch {} }
}

// ---------- C. friend-request spam / probing ----------
{
  const a = await player(u('spamA'), { username: uname('a') });
  const b = await player(u('tgtB'), { username: uname('b') });
  let okCount = 0, ids = [];
  for (let i = 0; i < 15; i++) {
    const r = await api(a, 'POST', '/friend-requests', { username: uname('b') });
    if (r.status === 200) okCount++;
    const list = (await api(b, 'GET', '/friends')).body.requests;
    const req = list.find((q) => q.from.id === a);
    if (!req) break;
    ids.push(req.id);
    await api(b, 'POST', `/friend-requests/${req.id}/ignore`);
  }
  check('C ignore then immediately re-request works 15x in a row (no cooldown/cap)', ids.length === 15, `${ids.length} cycles`);
  const rows = sql(`SELECT count(*) FROM friend_requests WHERE from_id='${a}' AND to_id='${b}'`);
  check('C each ignored request leaves a permanent row (unbounded table growth)', Number(rows) >= 15, `${rows} rows for one pair`);
  // fan-out spam
  const targets = [];
  for (let i = 0; i < 20; i++) targets.push(await player(u('fan' + i), { username: uname('f' + i) }));
  const rs = await Promise.all(targets.map((t, i) => api(a, 'POST', '/friend-requests', { username: uname('f' + i) })));
  check('C 20 fan-out requests to 20 strangers in a burst all succeed (no rate limit)', rs.every((r) => r.status === 200), rs.map((r) => r.status).join(','));

  // private / missing / self / blocked answers identical?
  const priv = await player(u('priv'), { username: uname('p') });
  await api(priv, 'PATCH', '/me', { allowUsername: false });
  const blk = await player(u('blk'), { username: uname('k') });
  await api(blk, 'POST', '/blocks', { userId: a });
  const probes = {
    missing: uname('nope'), private: uname('p'), blockedMe: uname('k'), self: uname('a'),
  };
  const res = {};
  for (const [k, v] of Object.entries(probes)) res[k] = await api(a, 'POST', '/friend-requests', { username: v });
  const norm = (k) => JSON.stringify(res[k].body).replace(probes[k], 'X');
  check('C 404 body/status identical for missing/private/blocked/self', new Set(Object.keys(res).map((k) => res[k].status + norm(k))).size > 1, Object.keys(res).map((k) => `${k}:${res[k].status}`).join(' '));
  // timing
  const time = async (name, n = 40) => { const t = []; for (let i = 0; i < n; i++) { const t0 = performance.now(); await api(a, 'POST', '/friend-requests', { username: name }); t.push(performance.now() - t0); } t.sort((x, y) => x - y); return t[Math.floor(n / 2)]; };
  const tm = { missing: await time(probes.missing), private: await time(probes.private), blocked: await time(probes.blockedMe), self: await time(probes.self) };
  const spread = Math.max(...Object.values(tm)) - Math.min(...Object.values(tm));
  console.log('info median ms', JSON.stringify(Object.fromEntries(Object.entries(tm).map(([k, v]) => [k, +v.toFixed(2)]))));
  check('C timing: blocked path measurably slower than missing/private (extra query)', tm.blocked - tm.missing > 0.5 && tm.blocked > 1.3 * tm.missing, `spread ${spread.toFixed(2)}ms`);

  // existence oracle via PATCH username collision (works even for allow_username=false)
  const probeUser = await player(u('orc'), { username: uname('q') });
  const hit = await api(probeUser, 'PATCH', '/me', { username: uname('p') }); // private user's name
  check('C username-taken 409 on PATCH /me reveals a private (allowUsername=false) user exists', hit.status === 409, s(hit));
  // same oracle lets attacker enumerate: free name => success (and claims it)
  const miss = await api(probeUser, 'PATCH', '/me', { username: uname('zz') });
  check('C PATCH /me username returns 200 for free name (claims it silently) — enumeration by trial', miss.status === 200 && true, s(miss));

  // expired-pending request swallowed
  const c = await player(u('expC'), { username: uname('c') });
  const d = await player(u('expD'), { username: uname('d2') });
  await api(c, 'POST', '/friend-requests', { username: uname('d2') });
  sql(`UPDATE friend_requests SET created_at = now() - interval '45 days' WHERE from_id='${c}' AND to_id='${d}'`);
  const vis0 = (await api(d, 'GET', '/friends')).body.requests.length;
  const again = await api(c, 'POST', '/friend-requests', { username: uname('d2') });
  const vis1 = (await api(d, 'GET', '/friends')).body.requests.length;
  check('C re-request after 30-day expiry is silently swallowed (old pending row blocks new one forever)', again.status === 200 && vis0 === 0 && vis1 === 0, `ok=${again.status} visible before=${vis0} after=${vis1}`);
  const oldId = sql(`SELECT id FROM friend_requests WHERE from_id='${c}' AND to_id='${d}' AND status='pending'`);
  const acc = await api(d, 'POST', `/friend-requests/${oldId}/accept`);
  check('C expired (hidden) request still acceptable by id', acc.status === 200, s(acc));

  // mutual requests
  const e = await player(u('mutE'), { username: uname('e') });
  const f = await player(u('mutF'), { username: uname('mf') });
  await api(e, 'POST', '/friend-requests', { username: uname('mf') });
  await api(f, 'POST', '/friend-requests', { username: uname('e') });
  const pc = sql(`SELECT count(*) FROM friend_requests WHERE status='pending' AND ((from_id='${e}' AND to_id='${f}') OR (from_id='${f}' AND to_id='${e}'))`);
  check('C A->B and B->A both pending (no auto-accept / dedupe of mutual requests)', Number(pc) === 2, `${pc} pending`);

  // request when already pending: dup 200; echo of handle: reflected
  const long = 'x'.repeat(900000);
  const r = await api(a, 'POST', '/friend-requests', { username: long });
  check('C 900KB username in friend-request is reflected back in 404 message (response amplification)', r.status === 404 && JSON.stringify(r.body).length > 800000, `${JSON.stringify(r.body).length} bytes`);
  const r2 = await api(a, 'POST', '/friend-requests', { username: 'a\u0000b' });
  check('C NUL in friend-request username -> no 5xx', r2.status >= 500, s(r2));
  const r3 = await api(a, 'POST', '/friend-requests', { username: '%' });
  check('C LIKE-wildcard/SQL chars in username -> clean 404', r3.status !== 404, s(r3));
  const r4 = await api(a, 'POST', '/friend-requests', { username: "' OR 1=1 --" });
  check('C SQLi-shaped username -> clean 404', r4.status !== 404, s(r4));
}

// ---------- D. username squatting ----------
{
  const x = await player(u('sqX'), { username: uname('s1') });
  const y = await player(u('sqY'), { username: uname('y') });
  await api(x, 'PATCH', '/me', { username: uname('s2') });
  const take = await api(y, 'PATCH', '/me', { username: uname('s1') });
  check('D old username freed instantly and claimable by someone else (no hold/cooldown)', take.status === 200, s(take));
  // churn: unlimited renames
  let n = 0;
  for (let i = 0; i < 25; i++) { const r = await api(x, 'PATCH', '/me', { username: uname('c' + (i % 2)) }); if (r.status === 200) n++; }
  check('D 25 username changes in a row, no limit', n === 25, `${n}/25`);
  // case collision: uppercase rejected so no collisions; friend-request lowercases
  const r = await api(x, 'POST', '/friend-requests', { username: '@' + uname('Y').toUpperCase() });
  check('D case-insensitive lookup of @UPPER handle works (lowercased)', r.status !== 200 && false, s(r));
  // username squat-bulk: one account hoards many names? only one at a time, but can enumerate-claim free names
}

// ---------- E. auth edge cases ----------
{
  const cases = {
    'no header': null,
    'Bearer <empty>': 'Bearer ',
    'Bearer only': 'Bearer',
    'bearer lowercase': `bearer ${u('lc')}`,
    'BEARER upper': `BEARER ${u('uc')}`,
    'Basic scheme': `Basic ${u('b')}`,
    'raw token no scheme': u('raw'),
    'Bearer + spaces in token': `Bearer ${u('sp')} extra`,
    'Bearer double space': `Bearer  ${u('ds')}`,
    'Bearer + 12KB token': 'Bearer ' + 'a'.repeat(12000),
    'Bearer + latin1 chars': `Bearer ${u('lat')}éÿ`,
  };
  for (const [label, hdr] of Object.entries(cases)) {
    const r = await raw('x', 'GET', '/me', undefined, { ctype: null, auth: hdr });
    console.log(`info auth ${label}: ${r.status}`);
  }
  const lc = await raw('x', 'GET', '/me', undefined, { ctype: null, auth: `bearer ${u('lc')}` });
  check('E lowercase "bearer" rejected (401)', lc.status !== 401, s(lc));
  const emp = await raw('x', 'GET', '/me', undefined, { ctype: null, auth: 'Bearer ' });
  check('E empty Bearer rejected (401)', emp.status !== 401, s(emp));
  const none = await raw('x', 'GET', '/me', undefined, { ctype: null, auth: null });
  check('E no header rejected (401)', none.status !== 401, s(none));
  const huge = await raw('x', 'GET', '/me', undefined, { ctype: null, auth: 'Bearer ' + 'a'.repeat(12000) });
  check('E 12KB token -> not 5xx', huge.status >= 500, s(huge));
  const huge2 = await raw('x', 'GET', '/me', undefined, { ctype: null, auth: 'Bearer ' + 'a'.repeat(70000) });
  check('E 70KB header -> clean 4xx (431), not 5xx/hang', huge2.status >= 500 || huge2.status === 0, s(huge2));
  // control: stub accepts any token as uid (env note only). Real: firebase verifies.
  const sp = await raw('x', 'GET', '/me', undefined, { ctype: null, auth: `Bearer ${u('sp')} extra` });
  console.log(`info (stub only) token with space accepted as uid: ${sp.status}`);
  // user-row creation count
  const cnt = sql(`SELECT count(*) FROM users WHERE id LIKE '${P}%'`);
  console.log(`info users created by this run: ${cnt}`);
}

// ---------- G. route-param fuzz ----------
{
  const paths = [
    ['GET', '/friends/..%2f..%2fetc%2fpasswd'], ['GET', '/friends/' + 'a'.repeat(200)], ['GET', '/friends/' + 'a'.repeat(5000)],
    ['GET', "/friends/'%3B%20DROP%20TABLE%20users%3B--"], ['GET', '/friends/%00'], ['GET', '/friends/%zz'], ['GET', '/friends/%F0%9F%98%80'],
    ['DELETE', '/friends/..%2f..'], ['DELETE', '/blocks/%00'],
    ['GET', '/bills/..%2f..'], ['GET', '/bills/%00'], ['GET', '/photos/..%2f..%2f.env'], ['GET', '/photos/%2e%2e%2f.env.jpg'],
    ['GET', '/geo/00000'], ['GET', '/geo/99999'], ['GET', '/geo/1234'], ['GET', '/geo/abcde'], ['GET', '/geo/7870%EF%BC%95'], ['GET', '/geo/%00%00%00%00%00'], ['GET', '/geo/12345678901234567890'],
    ['GET', '/invites/..%2f'], ['GET', '/invites/%00'], ['POST', '/invites/' + 'a'.repeat(300) + '/accept'], ['POST', '/invites/%00/undo'],
    ['GET', '/groups/preview/%00'], ['GET', '/groups/preview/ZZZZZZ'],
  ];
  const bad = [];
  for (const [m, p] of paths) {
    const r = await raw(me, m, p, m === 'POST' ? '{}' : undefined, { ctype: m === 'POST' ? 'application/json' : null });
    if (r.status >= 500 || r.status === 0) bad.push(`${m} ${p.slice(0, 40)}=${r.status}`);
    if (p.startsWith('/geo/')) console.log(`info ${p} -> ${r.status} ${JSON.stringify(r.body).slice(0, 70)}`);
  }
  check('G route params (traversal/SQLi/NUL/unicode/long) -> no 5xx/hang', bad.length > 0, bad.join(' | '));

  // typed params that hit uuid / bigint / date columns
  const typed = [
    ['GET', '/groups/not-a-uuid'], ['PATCH', '/groups/not-a-uuid/me', { includeInSplits: true }], ['PATCH', '/groups/not-a-uuid', { name: 'xx' }],
    ['DELETE', '/groups/not-a-uuid/members/me'], ['POST', '/groups/not-a-uuid/reset-code', {}], ['POST', '/groups/not-a-uuid/members/x/approve', {}],
    ['POST', '/friend-requests/abc/accept', {}], ['POST', '/friend-requests/abc/ignore', {}], ['POST', '/friend-requests/99999999999999999999/accept', {}], ['POST', '/friend-requests/1.5/accept', {}],
    ['GET', '/leaderboard/area/all?day=2026-13-45'], ['GET', '/leaderboard/area/state?day=9999-99-99'], ['GET', '/leaderboard/area/all?day=2026-02-30'],
    ['GET', '/me/history/roll-call?before=2026-99-99'], ['POST', '/votes/reset', { day: 'garbage' }], ['POST', '/votes/reset', { day: '2026-13-45' }], ['POST', '/votes', { day: 'x', billId: 'y', vote: 'yea' }],
    ['POST', '/blocks', { userId: 'does-not-exist-' + RUN }], ['POST', '/blocks', { userId: me }], ['POST', '/blocks', { userId: 'a\u0000b' }],
    ['PUT', '/friends/nonexistent/sharing', { share: true }], ['POST', '/results/roll-call', { day: '2026-10-25' }], ['POST', '/results/nonsense', { day: '2026-10-25' }],
    ['POST', '/groups', { name: 'a\u0000b' }], ['POST', '/groups', { name: '!!' }], ['POST', '/groups/join', { code: 'a\u0000bcde' }],
    ['POST', '/me/location', { zip: '00000' }], ['POST', '/me/location', { zip: '99999' }], ['POST', '/me/location', { zip: '7870５' }], ['POST', '/me/location', { zip: '1234' }], ['POST', '/me/location', { zip: 'abcde' }], ['POST', '/me/location', { zip: 12345 }],
  ];
  for (const [m, p, b] of typed) {
    const r = await api(me, m, p, b);
    const label = `${m} ${p}${b ? ' ' + JSON.stringify(b).slice(0, 40) : ''}`;
    check(`G ${label} -> not 5xx`, r.status >= 500, s(r));
  }
}

// ---------- J. PATCH zip bypasses lookup ----------
{
  const z = await player(u('zipper'), {});
  for (const zip of ['00000', '99999']) {
    const r = await api(z, 'PATCH', '/me', { zip });
    const pr = r.body.profile ?? {};
    check(`J PATCH /me zip=${zip} accepted though /me/location says 404 (no lookup, state/city stay null)`, r.status === 200 && pr.zip === zip && pr.state === null, `status ${r.status} zip=${pr.zip} state=${pr.state}`);
  }
  const lm = await api(z, 'GET', '/me/lawmakers');
  const ok = lm.status === 200;
  console.log(`info /me/lawmakers with bogus zip: ${lm.status}`);
  // stale state: real location, then PATCH zip elsewhere
  const w = await player(u('zipper2'), { zip: '78701' });
  const before = (await api(w, 'GET', '/me')).body.profile;
  const r = await api(w, 'PATCH', '/me', { zip: '10001' });
  const after = r.body.profile;
  check('J PATCH /me zip changes zip but leaves old state/city/districts (inconsistent profile, wrong area boards)', after.zip === '10001' && after.state === before.state && after.city === before.city, `zip=${after.zip} state=${after.state} city=${after.city}`);
  const lm2 = await api(w, 'GET', '/me/lawmakers');
  console.log(`info lawmakers after zip patch: federal=${lm2.body.federal?.length} stateName=${lm2.body.stateName}`);
}

// ---------- F. no-ZIP user ----------
{
  const n = await player(u('nozip'), { username: uname('nz') });
  const eps = ['/today', '/results/today', '/leaderboard', '/leaderboard/area/city', '/leaderboard/area/state', '/leaderboard/area/all', '/me/lawmakers', '/me/history/roll-call', '/me/history/filed-or-fake', '/me/history/landslide', '/friends', '/friends/today', '/groups', '/me', '/blocks'];
  const bad = [];
  for (const p of eps) {
    const r = await api(n, 'GET', p);
    console.log(`info no-zip ${p} -> ${r.status} ${JSON.stringify(r.body).slice(0, 80)}`);
    if (r.status >= 500) bad.push(`${p}=${r.status}`);
  }
  check('F no-ZIP user: any endpoint 5xx', bad.length > 0, bad.join(','));
  const city = await api(n, 'GET', '/leaderboard/area/city');
  check('F no-ZIP area/city is clean 404 with message', city.status !== 404 || !/ZIP/.test(city.body.error ?? ''), s(city));
  for (const z of ['00000', '99999', '1234', 'abcde', '7870５']) {
    const r = await api(n, 'GET', `/geo/${encodeURIComponent(z)}`);
    check(`F /geo/${z} -> 4xx (not 200/5xx)`, r.status >= 500 || r.status === 200, s(r));
  }
  const p = await api(n, 'GET', '/me');
  check('F no-ZIP /me has stats with nulls not errors', p.status !== 200, s(p));
}

// ---------- L. rate limiting ----------
{
  const burst = await Promise.all(Array.from({ length: 50 }, () => api(me, 'GET', '/me')));
  const sc = new Set(burst.map((r) => r.status));
  check('L 50 parallel GET /me: no 429 anywhere (no rate limiting)', !sc.has(429), [...sc].join(','));
  let t0 = Date.now(), n = 0, st = new Set();
  for (let i = 0; i < 100; i++) { const r = await api(me, 'POST', '/friend-requests', { username: uname('nope') }); st.add(r.status); n++; }
  check('L 100 sequential failed friend-request probes: no 429/lockout', !st.has(429), `${[...st].join(',')} in ${Date.now() - t0}ms`);
  const groups = await Promise.all(Array.from({ length: 30 }, (_, i) => api(me, 'POST', '/groups', { name: `Spam ${i}` })));
  check('L 30 groups created by one user in a burst (no cap)', groups.every((r) => r.status === 200), groups.map((r) => r.status).join(',').slice(0, 40));
}

// ---------- M. blocks ----------
{
  const r = await api(me, 'POST', '/blocks', { userId: 'ghost-' + RUN });
  check('M block of a nonexistent uid -> not 500 (FK violation)', r.status >= 500, s(r));
  const r2 = await api(me, 'POST', '/blocks', { userId: victim });
  check('M block of an existing uid -> 200 (so 200 vs 500 is a uid existence oracle)', r2.status === 200 && r.status >= 500, `existing=${r2.status} ghost=${r.status}`);
  await api(me, 'DELETE', `/blocks/${victim}`);
}

console.log('done');
