// QA: groups + group vote splits. Run: node 04-groups.mjs   (uids all start with grp-<RUN>-)
// check(label, isBug, extra): prints "BUG " when isBug is true, "ok  " otherwise.
import { api, player, sql, check, RUN } from './lib.mjs';

let n = 0;
const uid = (name) => `grp-${RUN}-${name}`;
async function mk(name, extra = {}) {
  const u = uid(name);
  await player(u, { zip: '20001', username: `grp${RUN}${(n++).toString(36)}`.slice(0, 20), displayName: `G ${name}`, ...extra });
  return u;
}
const mkMany = (prefix, count) => Promise.all(Array.from({ length: count }, (_, i) => mk(`${prefix}${i}`)));

const probe = await mk('probe');
const today = (await api(probe, 'GET', '/today')).body;
const DAY = today.day;
const ALL = today.rollCall.map((b) => b.id);
const [B0, B1] = ALL;
console.log(`# day ${DAY}, bills ${B0}, ${B1}`);

const vote = (u, bill, v) => api(u, 'POST', '/votes', { day: DAY, billId: bill, vote: v });
async function group(admin, name, approvalRequired = false) {
  const r = await api(admin, 'POST', '/groups', { name, approvalRequired });
  if (r.status !== 200) throw new Error(`create group ${name}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body; // {id, code}
}
const join = (u, code) => api(u, 'POST', '/groups/join', { code });
const view = async (u, g) => (await api(u, 'GET', `/groups/${g.id}`)).body;
const splitOf = async (u, g, bill) => (await view(u, g)).today?.find((s) => s.billId === bill);
const yeaCount = (s) => (s && s.yeaPct !== null ? Math.round((s.yeaPct / 100) * s.voters) : null);

const info = (label, extra = '') => console.log(`info ${label}${extra ? ` — ${extra}` : ''}`);
const held = (label, ok, extra = '') => check(label, !ok, extra); // ok=true means the guard held

// ---------------------------------------------------------------- 1. time differencing (no sybils, 6 real members)
{
  const a = await mk('t1a');
  const ms = await mkMany('t1m', 4);
  const t = await mk('t1target');
  const g = await group(a, 'Time Diff');
  for (const u of ms) await join(u, g.code);
  // bill0: a,m0,m1 yea; m2,m3 nay -> 3/5. bill1: a yea, rest nay -> 1/5
  await vote(a, B0, 'yea'); await vote(ms[0], B0, 'yea'); await vote(ms[1], B0, 'yea'); await vote(ms[2], B0, 'nay'); await vote(ms[3], B0, 'nay');
  await vote(a, B1, 'yea'); for (const u of ms) await vote(u, B1, 'nay');
  await join(t, g.code);
  const pre0 = await splitOf(a, g, B0), pre1 = await splitOf(a, g, B1);
  const v0 = await view(a, g);
  check('unfinished Roll Call votes already counted in splits', v0.playedToday === 0 && pre0?.voters === 5, `playedToday=${v0.playedToday} voters=${pre0?.voters} yeaPct=${pre0?.yeaPct} (nobody finished Roll Call)`);
  await vote(t, B0, 'nay'); await vote(t, B1, 'yea');
  const post0 = await splitOf(a, g, B0), post1 = await splitOf(a, g, B1);
  const inf0 = yeaCount(post0) - yeaCount(pre0) === 1 ? 'yea' : 'nay';
  const inf1 = yeaCount(post1) - yeaCount(pre1) === 1 ? 'yea' : 'nay';
  check('time differencing: a member learns target vote from voters k->k+1 + yeaPct delta', inf0 === 'nay' && inf1 === 'yea',
    `bill0 ${pre0?.voters}v ${pre0?.yeaPct}% -> ${post0?.voters}v ${post0?.yeaPct}% => target ${inf0} (truth nay); bill1 ${pre1?.yeaPct}% -> ${post1?.yeaPct}% => ${inf1} (truth yea)`);
  // target changes mind: voters constant, pct moves -> flip is visible
  await vote(t, B0, 'yea');
  const flip = await splitOf(a, g, B0);
  check('vote change by target visible as yeaPct move at constant voters', flip.voters === post0.voters && flip.yeaPct !== post0.yeaPct, `${post0.yeaPct}% -> ${flip.yeaPct}%`);
  // reset
  const boardBefore = (await view(a, g)).board;
  await api(t, 'POST', '/votes/reset', { day: DAY });
  const afterReset = await splitOf(a, g, B0);
  check('vote reset visible to group (voters 6->5)', afterReset.voters === 5, `voters=${afterReset.voters}`);
  // finishing: the board names who finished -> ties vote timing to a person
  for (const b of ALL) await vote(t, b, b === B1 ? 'yea' : 'nay');
  const fin = await api(t, 'POST', '/results/roll-call', { day: DAY });
  const boardAfter = (await view(a, g)).board;
  const mover = boardAfter.filter((r) => (boardBefore.find((x) => x.id === r.id)?.points ?? 0) !== r.points).map((r) => r.name);
  info('weekly board after target finishes Roll Call shows exactly who moved', `finish=${fin.status} movers=${JSON.stringify(mover)} playedToday=${(await view(a, g)).playedToday} (by design, but pairs the person with the voters counter above)`);
}

// ---------------------------------------------------------------- 2. sybil: 2-person group + 3 known accounts
{
  const x = await mk('s2x');
  const t = await mk('s2target');
  const sy = await mkMany('s2s', 3);
  const g = await group(x, 'Sybil Two');
  await join(t, g.code);
  // bill0: target nay, bill1: target yea. attacker votes opposite of target on purpose (does not matter).
  await vote(x, B0, 'yea'); await vote(t, B0, 'nay');
  await vote(x, B1, 'nay'); await vote(t, B1, 'yea');
  const before = await splitOf(x, g, B0);
  held('control: 2 voters hidden as few', before.hiddenReason === 'few' && before.yeaPct === null, JSON.stringify(before));
  // sybils vote first (known), then join the group with its code
  for (const [i, s] of sy.entries()) { await vote(s, B0, i < 2 ? 'yea' : 'nay'); await vote(s, B1, 'nay'); }
  for (const s of sy) await join(s, g.code);
  const a0 = await splitOf(x, g, B0), a1 = await splitOf(x, g, B1);
  // attacker knows: x yea, sybils yea yea nay on bill0 => known yea = 3 ; bill1: x nay, sybils nay => known yea 0
  const learn0 = yeaCount(a0) - 3 === 1 ? 'yea' : 'nay';
  const learn1 = yeaCount(a1) - 0 === 1 ? 'yea' : 'nay';
  check('sybil: 3 known accounts joining a 2-person group reveal the target vote', learn0 === 'nay' && learn1 === 'yea',
    `after join bill0 ${a0.voters}v ${a0.yeaPct}% => target ${learn0} (truth nay); bill1 ${a1.yeaPct}% => ${learn1} (truth yea)`);
  for (const s of sy) await api(s, 'DELETE', `/groups/${g.id}/members/me`);
  const cleaned = await splitOf(x, g, B0);
  info('sybils leave afterwards; group back to hidden, leaving no trace for the target',  JSON.stringify(cleaned));
}

// ---------------------------------------------------------------- 3. unanimous label oracle (also without sybils)
{
  const res = {};
  for (const tv of ['yea', 'nay']) {
    const x = await mk(`s3x${tv}`);
    const t = await mk(`s3t${tv}`);
    const sy = await mkMany(`s3s${tv}`, 3);
    const g = await group(x, `Unanimous ${tv}`);
    for (const u of [t, ...sy]) await join(u, g.code);
    for (const u of [x, ...sy]) await vote(u, B0, 'yea');
    await vote(t, B0, tv);
    res[tv] = await splitOf(x, g, B0);
  }
  check("hiddenReason 'unanimous' tells a 5-9 voter group everyone voted the same (target yea=>unanimous, nay=>80%)",
    res.yea.hiddenReason === 'unanimous' && res.nay.yeaPct === 80, `target yea: ${JSON.stringify({ r: res.yea.hiddenReason, pct: res.yea.yeaPct, v: res.yea.voters })}; target nay: ${JSON.stringify({ r: res.nay.hiddenReason, pct: res.nay.yeaPct })}`);
  // no sybils at all: 5 real members, each only knows own vote
  const us = await mkMany('s3r', 5);
  const g = await group(us[0], 'Unanimous Real');
  for (const u of us.slice(1)) await join(u, g.code);
  for (const u of us) await vote(u, B0, 'nay');
  const s = await splitOf(us[0], g, B0);
  check("no sybils: 5 members who all voted nay: any member sees 'unanimous' and so learns the other 4 votes", s.hiddenReason === 'unanimous', JSON.stringify(s));
}

// ---------------------------------------------------------------- 4. admin differencing (remove target)
{
  const a = await mk('a4admin');
  const ms = await mkMany('a4m', 4);
  const t = await mk('a4target');
  const g = await group(a, 'Admin Diff');
  for (const u of [...ms, t]) await join(u, g.code);
  await vote(a, B0, 'yea'); await vote(ms[0], B0, 'yea'); await vote(ms[1], B0, 'nay'); await vote(ms[2], B0, 'nay'); await vote(ms[3], B0, 'yea'); await vote(t, B0, 'nay');
  const before = await splitOf(a, g, B0);
  const rm = await api(a, 'DELETE', `/groups/${g.id}/members/${t}`);
  const after = await splitOf(a, g, B0);
  const inf = yeaCount(before) - yeaCount(after) === 1 ? 'yea' : 'nay';
  check('admin differencing: removing target and diffing splits reveals the vote', inf === 'nay' && rm.status === 200,
    `before ${before.voters}v ${before.yeaPct}% / after ${after.voters}v ${after.yeaPct}% => target ${inf} (truth nay)`);
  const tg = await api(t, 'GET', '/groups');
  info('removed target gets no signal (group just vanishes from their list)', `groups=${tg.body.groups.length}`);
  const rj = await join(t, g.code);
  const back = await splitOf(a, g, B0);
  check('removed member re-joins instantly with the code (no ban); old votes re-count', rj.body.status === 'active' && back.voters === before.voters, `rejoin=${JSON.stringify(rj.body)} voters=${back.voters}`);
}

// ---------------------------------------------------------------- 5. include_in_splits
{
  const us = await mkMany('i5', 6);
  const g = await group(us[0], 'Include Test');
  for (const u of us.slice(1)) await join(u, g.code);
  for (const [i, u] of us.entries()) await vote(u, B0, i < 3 ? 'yea' : 'nay');
  const s6 = await splitOf(us[0], g, B0);
  await api(us[5], 'PATCH', `/groups/${g.id}/me`, { includeInSplits: false });
  const s5 = await splitOf(us[0], g, B0);
  held('include_in_splits=false removes the voter from the count', s5.voters === 5 && s6.voters === 6, `${s6.voters}->${s5.voters}`);
  await api(us[4], 'PATCH', `/groups/${g.id}/me`, { includeInSplits: false });
  const s4 = await splitOf(us[0], g, B0);
  held('control: dropping to 4 re-hides', s4.hiddenReason === 'few' && s4.yeaPct === null, JSON.stringify(s4));
  // free-rider: excluded member can still read splits
  const v = await view(us[5], g);
  info('opted-out member still reads everyone else\'s splits (free-rider)', `includeInSplits=${v.includeInSplits} today=${v.today.length}`);
  // toggle after-the-fact: opted-out member re-opting retroactively counts old votes
  await api(us[5], 'PATCH', `/groups/${g.id}/me`, { includeInSplits: true });
  const s5b = await splitOf(us[0], g, B0);
  console.log(`info  re-enabling include_in_splits retroactively adds old votes (voters ${s4.voters}->${s5b.voters}); toggling by target is itself a visible 1-voter delta`);
  // rejoin resets the preference
  await api(us[5], 'PATCH', `/groups/${g.id}/me`, { includeInSplits: false });
  await api(us[5], 'DELETE', `/groups/${g.id}/members/me`);
  await join(us[5], g.code);
  const v2 = await view(us[5], g);
  check('leave+rejoin silently resets include_in_splits to true (row deleted)', v2.includeInSplits === true, `includeInSplits=${v2.includeInSplits} after previously setting false`);
}

// ---------------------------------------------------------------- 6. pending members / approve
{
  const a = await mk('p6admin');
  const p = await mk('p6pending');
  const others = await mkMany('p6o', 4);
  const g = await group(a, 'Approval Group', true);
  const j = await join(p, g.code);
  held('control: join with approval gives pending', j.body.status === 'pending', JSON.stringify(j.body));
  for (const u of others) await join(u, g.code);
  for (const u of others) await api(a, 'POST', `/groups/${g.id}/members/${u}/approve`);
  const gv = await api(p, 'GET', `/groups/${g.id}`);
  held('pending member cannot read group (404)', gv.status === 404, `${gv.status} ${JSON.stringify(gv.body).slice(0, 120)}`);
  const lst = (await api(p, 'GET', '/groups')).body.groups.find((x) => x.id === g.id);
  console.log(`info  pending member's /groups row: ${JSON.stringify(lst)}`);
  await vote(p, B0, 'yea'); for (const u of [a, ...others]) await vote(u, B0, 'nay');
  const sp = await splitOf(a, g, B0);
  held('pending member vote not counted', sp.voters === 5, `voters=${sp.voters} (admin + 4 approved voted; pending voted yea)`);
  const pr = await api(p, 'PATCH', `/groups/${g.id}/me`, { includeInSplits: false });
  console.log(`info  pending PATCH /me -> ${pr.status} (allowed, harmless)`);
  const self = await api(p, 'POST', `/groups/${g.id}/members/${p}/approve`);
  held('pending cannot self-approve', self.status === 403, `status ${self.status}`);
  const rc = await api(p, 'POST', `/groups/${g.id}/reset-code`);
  held('pending cannot reset code', rc.status === 403, `status ${rc.status}`);
  const pre = await api(p, 'GET', `/groups/preview/${g.code}`);
  console.log(`info  preview as pending: ${JSON.stringify(pre.body)}`);
  // approve a uid that never asked
  const ghost = uid('p6ghost-never-existed');
  const ap = await api(a, 'POST', `/groups/${g.id}/members/${ghost}/approve`);
  const rows = sql(`select count(*) from group_members where group_id='${g.id}' and user_id='${ghost}'`);
  check('approve of a uid that never asked: returns ok but nothing created', ap.status === 200 && rows === '0', `status ${ap.status} body ${JSON.stringify(ap.body)} rows=${rows} (misleading ok:true; should 404)`);
  // approve a real user who never asked
  const rando = await mk('p6rando');
  const ap2 = await api(a, 'POST', `/groups/${g.id}/members/${rando}/approve`);
  const rows2 = sql(`select count(*) from group_members where group_id='${g.id}' and user_id='${rando}'`);
  held('approve cannot force-add a user who never asked', rows2 === '0', `status ${ap2.status} rows=${rows2}`);
  // approve while pending count; pending not capped
  // admin removes pending
  const rm = await api(a, 'DELETE', `/groups/${g.id}/members/${p}`);
  held('admin can reject (delete) pending', rm.status === 200, `status ${rm.status}`);
}

// ---------------------------------------------------------------- 7. non-member probing
{
  const a = await mk('n7admin');
  const m = await mk('n7m');
  const s = await mk('n7stranger');
  const g = await group(a, 'Probe Me');
  await join(m, g.code);
  const r = {};
  r.get = await api(s, 'GET', `/groups/${g.id}`);
  r.patchMe = await api(s, 'PATCH', `/groups/${g.id}/me`, { includeInSplits: false });
  r.reset = await api(s, 'POST', `/groups/${g.id}/reset-code`);
  r.approve = await api(s, 'POST', `/groups/${g.id}/members/${s}/approve`);
  r.patch = await api(s, 'PATCH', `/groups/${g.id}`, { name: 'pwned' });
  r.delOther = await api(s, 'DELETE', `/groups/${g.id}/members/${m}`);
  r.delAdmin = await api(m, 'DELETE', `/groups/${g.id}/members/${a}`);
  r.delMe = await api(s, 'DELETE', `/groups/${g.id}/members/me`);
  held('non-member GET /groups/:id blocked', r.get.status === 404, `${r.get.status}`);
  check('non-member PATCH /groups/:id/me returns ok:true for a group they are not in (silent no-op)', r.patchMe.status === 200, `${r.patchMe.status} ${JSON.stringify(r.patchMe.body)}; rows=${sql(`select count(*) from group_members where group_id='${g.id}' and user_id='${s}'`)}`);
  held('non-member reset-code blocked', r.reset.status === 403, `${r.reset.status}`);
  held('non-member approve blocked', r.approve.status === 403, `${r.approve.status}`);
  held('non-member rename blocked', r.patch.status === 403, `${r.patch.status}`);
  held('non-member cannot remove a member', r.delOther.status === 403, `${r.delOther.status}`);
  held('plain member cannot remove admin', r.delAdmin.status === 403, `${r.delAdmin.status}`);
  const stillThere = (await view(m, g)).name === 'Probe Me';
  held('group state intact after probes', stillThere, '');
  const bad = await api(s, 'GET', '/groups/not-a-uuid');
  check('malformed group id handled (not 500)', bad.status === 500, `${bad.status} ${JSON.stringify(bad.body)}`);
  const bad2 = await api(s, 'PATCH', '/groups/not-a-uuid/me', { includeInSplits: true });
  check('malformed group id on PATCH /me handled (not 500)', bad2.status === 500, `${bad2.status}`);
  const bad3 = await api(s, 'POST', '/groups/not-a-uuid/members/x/approve');
  check('malformed id on approve (non-admin) handled (not 500)', bad3.status === 500, `${bad3.status}`);
}

// ---------------------------------------------------------------- 8. admin leaves / 9. admin deletes account
{
  const a = await mk('l8admin');
  const ms = await mkMany('l8m', 2);
  const p = await mk('l8pending');
  const g = await group(a, 'Orphan Group', true);
  for (const u of ms) { await join(u, g.code); await api(a, 'POST', `/groups/${g.id}/members/${u}/approve`); }
  await join(p, g.code);
  const leave = await api(a, 'DELETE', `/groups/${g.id}/members/me`);
  const v = await view(ms[0], g);
  const rc = await api(ms[0], 'POST', `/groups/${g.id}/reset-code`);
  const ap = await api(ms[0], 'POST', `/groups/${g.id}/members/${p}/approve`);
  const adminRow = sql(`select admin_id from groups where id='${g.id}'`);
  const roles = sql(`select string_agg(role,',') from group_members where group_id='${g.id}'`);
  check('admin leaving leaves group admin-less forever (no promotion, pending can never be approved, code never resettable)',
    leave.status === 200 && v.isAdmin === false && rc.status === 403 && ap.status === 403,
    `leave ${leave.status}; roles=[${roles}]; groups.admin_id still ${adminRow === uid('l8admin') ? 'the departed admin' : adminRow}; reset-code ${rc.status}; approve ${ap.status}`);
  const pre = await api(ms[0], 'GET', `/groups/preview/${g.code}`);
  check('preview still advertises the departed admin as adminName', pre.body.adminName === 'G l8admin', JSON.stringify(pre.body));
  // departed admin returns as plain member
  const rj = await join(a, g.code);
  const rv = await api(a, 'GET', `/groups/${g.id}`);
  console.log(`info  departed admin re-joins -> ${JSON.stringify(rj.body)}; isAdmin=${rv.body.isAdmin} (approval_required group => goes pending even though groups.admin_id is them)`);
  await api(a, 'DELETE', `/groups/${g.id}/members/me`);
  // departed admin deletes their account later: group they no longer run is deleted from under the members
  const del = await api(a, 'DELETE', '/me');
  const gone = await api(ms[0], 'GET', `/groups/${g.id}`);
  check('deleting the account of a long-gone admin destroys the group for remaining members', gone.status === 404, `DELETE /me ${del.status}; member GET group -> ${gone.status}`);
}
{
  const a = await mk('d9admin');
  const ms = await mkMany('d9m', 3);
  const g = await group(a, 'Doomed Group');
  for (const u of ms) await join(u, g.code);
  await vote(a, B0, 'yea');
  const del = await api(a, 'DELETE', '/me');
  const gone = await api(ms[0], 'GET', `/groups/${g.id}`);
  const lst = (await api(ms[0], 'GET', '/groups')).body.groups;
  check('admin DELETE /me with active members: whole group (and its membership) is deleted, no handover', gone.status === 404 && !lst.some((x) => x.id === g.id), `DELETE /me ${del.status}; member GET group ${gone.status}; member still has ${lst.length} groups`);
  const pre = await api(ms[0], 'GET', `/groups/preview/${g.code}`);
  console.log(`info  preview of deleted group code -> ${pre.status}`);
}

// ---------------------------------------------------------------- 10. blocks + weekly board
{
  const a = await mk('b10a');
  const b = await mk('b10b');
  const ms = await mkMany('b10m', 4);
  const g = await group(a, 'Block Test');
  for (const u of [b, ...ms]) await join(u, g.code);
  for (const u of [a, b, ...ms]) await vote(u, B0, 'yea');
  await vote(ms[3], B0, 'nay');
  for (const u of [a, b, ...ms]) { await vote(u, B1, 'yea'); await api(u, 'POST', '/results/roll-call', { day: DAY }); }
  await api(a, 'POST', '/blocks', { userId: b });
  const va = await view(a, g), vb = await view(b, g), vm = await view(ms[0], g);
  held('blocker board hides blocked user', !va.board.some((r) => r.id === b), `a sees ${va.board.length}/${vm.board.length} rows`);
  held('blocked user board hides blocker', !vb.board.some((r) => r.id === a), `b sees ${vb.board.length} rows`);
  info('blocked pair still count in each other\'s splits and member counts',  `voters=${va.today.find((s) => s.billId === B0)?.voters}`);
  info('block leaves both in group; members/playedToday still count the blocked user (members minus boardRows reveals them)', `a: members=${va.members} playedToday=${va.playedToday} boardRows=${va.board.length}`);
  info('admin `people` still lists a user the admin blocked (name + id)', `people=${va.people.length} includesBlocked=${va.people.some((p) => p.id === b)}`);
  const gl = (await api(a, 'GET', '/groups')).body.groups.find((x) => x.id === g.id);
  console.log(`info  a's rank in /groups=${gl.rank}, board ids exposed to members: ${JSON.stringify(vm.board.map((r) => Object.keys(r)).at(0))}`);
  // user with group_boards=false: hidden from board but admin sees them
  await api(ms[1], 'PATCH', '/me', { groupBoards: false });
  const va2 = await view(a, g);
  const hid = va2.people.find((p) => p.id === ms[1]);
  info('member who hides from group boards is still listed (id+name) in admin people[] and counted in members', `onBoard=${va2.board.some((r) => r.id === ms[1])} inPeople=${!!hid}`);
}

// ---------------------------------------------------------------- 11. names
{
  const names = {
    emoji2: '🎉🎉', emoji1: '😀', punct: '!!', zwsp: '​​', newline: 'a\nb', len40: 'x'.repeat(40), len41: 'x'.repeat(41),
    emoji20: '😀'.repeat(20), emoji21: '😀'.repeat(21), mathbold: '𝐀𝐁 𝐂𝐃', unicode: 'Ünï Çödé', cjk: '漢字 グループ', rtl: '‮evil',
    spaces: '   ', trimmed: '  ab  ', inner: 'a        b', digits: 'A1 B2', one: 'a', html: '<script>alert(1)</script>', dots: 'ab..cd',
  };
  const u = await mk('nm');
  const out = {};
  for (const [k, name] of Object.entries(names)) {
    const r = await api(u, 'POST', '/groups', { name, approvalRequired: false });
    out[k] = r;
  }
  const list = (await api(u, 'GET', '/groups')).body.groups;
  const byName = new Map(list.map((x) => [x.name, x]));
  const lone = /[\ud800-\udbff](?![\udc00-\udfff])|(?<![\ud800-\udbff])[\udc00-\udfff]/;
  for (const [k, name] of Object.entries(names)) {
    const r = out[k];
    const row = r.status === 200 ? list.find((x) => x.id === r.body.id) : null;
    console.log(`info  name[${k}] -> ${r.status}${row ? ` badge=${JSON.stringify(row.badge)} name=${JSON.stringify(row.name)}` : ` ${JSON.stringify(r.body)}`}`);
  }
  const bad = (k) => out[k].status === 200 && list.find((x) => x.id === out[k].body.id);
  check('emoji-only name gives empty badge', bad('emoji2')?.badge === '', `🎉🎉 badge=${JSON.stringify(bad('emoji2')?.badge)} (single 😀 is rejected: ${out.emoji1.status})`);
  check('punctuation-only name ("!!") gives empty badge', bad('punct')?.badge === '', `badge=${JSON.stringify(bad('punct')?.badge)}`);
  check('zero-width-space-only name accepted (invisible group name, trim does not strip U+200B)', out.zwsp.status === 200, `status ${out.zwsp.status}; badge=${JSON.stringify(bad('zwsp')?.badge)}`);
  check('newline allowed in group name', out.newline.status === 200, `status ${out.newline.status}`);
  check('RTL-override char (U+202E) allowed in group name', out.rtl.status === 200, `status ${out.rtl.status}`);
  check('astral letters produce a lone surrogate in badge (invalid unicode in JSON)', !!bad('mathbold') && lone.test(bad('mathbold').badge), `badge=${JSON.stringify(bad('mathbold')?.badge)}`);
  held('40-char name accepted', out.len40.status === 200, `status ${out.len40.status}`);
  held('41-char name rejected', out.len41.status === 400, `status ${out.len41.status}`);
  info('length limit counts code points (zod), so 40 emoji fit (80 UTF-16 units)', `emoji20:${out.emoji20.status} emoji21:${out.emoji21.status}`);
  held('whitespace-only name rejected', out.spaces.status === 400, `status ${out.spaces.status}`);
  held('name trimmed', bad('trimmed')?.name === 'ab', JSON.stringify(bad('trimmed')?.name));
  info('internal whitespace not collapsed', JSON.stringify(bad('inner')?.name));
  check('digit-word badge drops letters ("A1 B2" gives "12")', bad('digits')?.badge !== 'AB', `badge=${JSON.stringify(bad('digits')?.badge)}`);
  info('markup stored verbatim in name (client must escape)', `name=${JSON.stringify(bad('html')?.name)}`);
  info('duplicate group names allowed (no unique index on groups.name)');
  // PATCH name path
  const gid = out.len40.body.id;
  const rn = await api(u, 'PATCH', `/groups/${gid}`, { name: '​​​' });
  console.log(`info  PATCH name to zero-width -> ${rn.status}`);
}

// ---------------------------------------------------------------- 12. code brute force / preview
{
  const a = await mk('c12admin');
  const s = await mk('c12scanner');
  const g = await group(a, 'Brute Target');
  const pr = await api(s, 'GET', `/groups/preview/${g.code.toLowerCase()}`);
  info('preview works for any signed-in user, lowercase ok, returns adminName(display name), group id, member count, approvalRequired', JSON.stringify(pr.body));
  const ch = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const rnd = () => Array.from({ length: 6 }, () => ch[Math.floor(Math.random() * ch.length)]).join('');
  const t0 = Date.now();
  const rs = await Promise.all(Array.from({ length: 50 }, () => api(s, 'GET', `/groups/preview/${rnd()}`)));
  const t1 = Date.now();
  const rs2 = await Promise.all(Array.from({ length: 50 }, () => api(s, 'GET', `/groups/preview/${rnd()}`)));
  const t2 = Date.now();
  const c429 = [...rs, ...rs2].filter((r) => r.status === 429).length;
  const rate = Math.round(100 / ((t2 - t0) / 1000));
  check('no rate limit on code guessing (preview + join): 100 guesses, zero 429s', c429 === 0, `${c429} x 429; ${rate} guesses/s from one client (32^6 = 1.07e9 codes; no per-user/IP throttle in src/index.ts)`);
  const jr = await Promise.all(Array.from({ length: 30 }, () => api(s, 'POST', '/groups/join', { code: rnd() })));
  check('join also unthrottled for wrong codes (30 parallel)', jr.every((r) => r.status === 404), `statuses ${[...new Set(jr.map((r) => r.status))]}`);
  // unicode case folding aliases: long s (U+017F) uppercases to S
  let gc = g.code;
  for (let i = 0; i < 60 && !gc.includes('S'); i++) gc = (await api(a, 'POST', `/groups/${g.id}/reset-code`)).body.code;
  const sIdx = gc.indexOf('S');
  if (sIdx >= 0) {
    const alias = gc.slice(0, sIdx) + 'ſ' + gc.slice(sIdx + 1);
    const ar = await api(s, 'GET', `/groups/preview/${encodeURIComponent(alias)}`);
    check('non-alphabet unicode char (long s) accepted as an alias of S in code', ar.status === 200, `status ${ar.status}`);
  } else console.log('info  (code has no S; skip long-s alias check)');
  // reset-code invalidates old
  const rc = await api(a, 'POST', `/groups/${g.id}/reset-code`);
  const old = await api(s, 'GET', `/groups/preview/${gc}`);
  held('reset-code invalidates old code', old.status === 404, `old->${old.status} new=${rc.body.code}`);
  // group spam
  const spam = await Promise.all(Array.from({ length: 20 }, (_, i) => api(s, 'POST', '/groups', { name: `Spam ${i}` })));
  check('no cap on groups created per user (20 in one burst)', spam.every((r) => r.status === 200), `${spam.filter((r) => r.status === 200).length}/20 created`);
}

// ---------------------------------------------------------------- 13. member cap race
{
  const a = await mk('r13admin');
  const g = await group(a, 'Cap Race');
  const fill = Array.from({ length: 46 }, (_, i) => uid(`r13f${i}`));
  for (let i = 0; i < fill.length; i += 23) await Promise.all(fill.slice(i, i + 23).map((u) => api(u, 'GET', '/me')));
  sql(`insert into group_members (group_id, user_id) values ${fill.map((u) => `('${g.id}','${u}')`).join(',')}`);
  const racers = Array.from({ length: 10 }, (_, i) => uid(`r13r${i}`));
  await Promise.all(racers.map((u) => api(u, 'GET', '/me')));
  const rs = await Promise.all(racers.map((u) => join(u, g.code)));
  const active = Number(sql(`select count(*) from group_members where group_id='${g.id}' and status='active'`));
  check('50-member cap broken by parallel joins (10 at 47 members)', active > 50, `active=${active}, join statuses ${rs.map((r) => r.status).join(',')}`);
}

console.log('# done');
