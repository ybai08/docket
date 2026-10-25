# Docket API QA report

Date: 2026-10-25. Target: `server/src` at commit `2e7c9e6`, run locally. Tester: the QA session, using six simulated-player agents plus a code review.

**Re-tested against `dbbaa7f`** (the backend's fixes) by re-running every script on the same local stack. The Status column below gives the result; details are in "Re-test after dbbaa7f" at the end.

## How this was tested

- **Isolation.** Every test ran against a throwaway Postgres in Docker: container `docket-qa-pg`, port 55432, database `docket_qa`. It was migrated and seeded with the normal `migrate.ts` and `seed.ts`. Production (Tiger Cloud) was never connected to, and `server/.env` was never loaded; the scripts use their own env file. No requests went to `api.docketapp.tech`.
- **Auth.** A Node loader hook resolves `firebase-admin/auth` to a stub, so `Authorization: Bearer <uid>` signs in as `<uid>`. `server/src/auth.ts` is unchanged, and nothing ships.
- **Running it.** `server/qa/start-local.sh` brings the whole stack up from scratch. Each `server/qa/NN-*.mjs` script is a self-contained, rerunnable repro. Run it with `node NN-name.mjs` from `server/qa`. Each check prints `BUG <label> — detail` when the problem reproduces and `ok <label>` when it held. `server/qa/lib.mjs` refuses any base URL that isn't localhost.
- **Personas, one script each.**

  | Script | Persona |
  |---|---|
  | `01-cheater.mjs` | Cheater |
  | `02-races.mjs` | Race conditions (`node 02-races.mjs [acct\|games\|roll\|groups\|friends]`) |
  | `04-groups.mjs` | Group splits |
  | `05-area.mjs` | Area leaderboard (owns ZIP 82001) |
  | `06-spam-fuzz.mjs` | Spammer and fuzzer |
  | `07-mover.mjs` | Player who moves states, deletes their account, and checks lawmakers (`SKIP_MIDNIGHT=1` skips the clock test) |
  | `08-groups-finished.mjs` | Group splits with finished Roll Calls (added for the `dbbaa7f` re-test) |

- **Friend-to-friend agreement** was reviewed in the code only (finding H7). No exploit script was written.
- **Seeded rows.** Some repros insert history straight into the local QA database: past votes, near-full groups, a repeated-bill day and backdated requests. Each finding says when it does.

Line numbers refer to `server/src/` unless a path is given.

## Summary

| # | Severity | Finding | Status |
|---|---|---|---|
| C1 | Critical | Group and area vote splits leak an individual's vote, live, before they finish | Fixed in dbbaa7f, except differencing when membership changes |
| H1 | High | `/today` ships every answer; a script scores a perfect 25 | Open (needs app changes) |
| H2 | High | A parallel `done:false` "un-finishes" a game, which can then be replayed after the reveal | Fixed in dbbaa7f |
| H3 | High | Parallel finishing submits are all accepted; the player keeps the better score | Fixed in dbbaa7f |
| H4 | High | Area stats leak exact scores by differencing at n ≥ 5; counts are shown at any n | Partly fixed in dbbaa7f |
| H5 | High | Group cap of 50 can be exceeded (56 to 85 members) | Fixed in dbbaa7f |
| H6 | High | A bill repeated on a later day makes Roll Call unfinishable and rewrites old votes | Partly fixed in dbbaa7f |
| H7 | High | Friend agreement is recomputed live over unfinished votes and exposed as an exact count (code review) | Fixed in dbbaa7f (code review) |
| M1 | Medium | Votes still land after Roll Call is locked; reset can lock in a Roll Call with zero votes | Fixed in dbbaa7f |
| M2 | Medium | A block racing an accept leaves the pair friends | Fixed in dbbaa7f |
| M3 | Medium | Fastify 4xx errors and bad params come back as 500 | Fixed in dbbaa7f and 6d366ff |
| M4 | Medium | Moving mid-day corrupts history and progress, and re-homes past scores | Open |
| M5 | Medium | With no set for a day, yesterday's ballot is served forever and streaks break | Open |
| M6 | Medium | Admin leaving or deleting their account orphans or destroys the group; DELETE /me can 500 | Open |
| M7 | Medium | Display-name impersonation, including a player named "You" | Partly fixed in dbbaa7f |
| M8 | Medium | Demo accounts count toward area thresholds | Open (softened by the area floor of 10) |
| M9 | Medium | No rate limiting: request spam, code guessing, unlimited groups | Open |
| M10 | Medium | An expired friend request silently blocks every new request from that sender | Open |
| L1–L12 | Low | See the list below | See the re-test section |

---

## Critical

### C1. Group and area vote splits leak an individual's vote, live, before they finish

**Did**

- Groups: a 6-member group. Five members voted, then the target voted, while another member polled `GET /groups/:id`.
- Area: 4 accounts voted in Cheyenne, then a target voted there. One account read `GET /leaderboard/area/city`.

**Happened**

- **Vote changes are visible, before anyone finishes.** In the group, `today[].voters` went from 5 to 6 and `yeaPct` from 60 to 50. Rounded percentages are exact at these sizes, so the observer learns the target's vote. This works for yea and nay.
  - Votes count the moment they are cast, before Roll Call is finished: `playedToday=0` while `voters=5`, `yeaPct=60`.
  - A changed vote moves `yeaPct` while `voters` stays the same (50 to 67). A `/votes/reset` drops `voters`.
  - The weekly board and `playedToday` show who just finished, which ties the change to a person.
- **`hiddenReason` leaks unanimity.** `'unanimous'` vs `'few'` tells every member of a 5–9 voter group that everyone voted the same way. This needs no sybils.
- **Sybil accounts defeat the minimum.**
  - In groups, accounts the attacker controls join by code with their earlier votes already counted. The split becomes visible, the target's vote is subtracted out, and the sybils leave without a trace.
  - An admin can get the same effect by removing a member and comparing; the removed member can rejoin at once and their votes count again.
- **Area splits leak the same way.** `bills[].voters` became 5 while `players` was still 4. `yeaPct` 80 meant the target voted nay. `'unanimous'` meant the target voted yea.

**Should**

- Count only votes from finished Roll Calls.
- Don't recompute splits live per vote: snapshot them once a day, or delay them.
- Return a single neutral hidden reason.
- Don't count votes cast before a member joined.
- Hide `voters` below the threshold.

**Cause**

- `groups.ts:69-93`: `splits` reads `votes` directly, with no `game_results.finished_at` join.
- `groups.ts:81,90`: hidden reason.
- `groups.ts:167-178`: open join; votes count retroactively.
- `groups.ts:256-261`: admin removal.
- `social.ts:210-226`: area per-bill splits, same pattern.
- `games.ts:161-174`: votes are written immediately.

**Repro**

- `04-groups.mjs`:
  - `unfinished Roll Call votes already counted in splits`
  - `time differencing: a member learns target vote…`
  - `hiddenReason 'unanimous' tells a 5-9 voter group…`
  - `sybil: 3 known accounts joining a 2-person group…`
  - `admin differencing…`
- `05-area.mjs`: A1, A2, A3, C1.

## High

### H1. `/today` ships every answer, so a script scores a perfect 25

**Did:** called `GET /today`, then posted answers computed only from that response.

**Happened**

- Filed or Fake captions carry `real`, plus an `explanation` that begins "Real." or "Docket wrote this one."
- Landslide items carry `yeas` and `nays`.
- The script scored 8/8 and 12/12, for a total of 25 and rank 1 of 346 on `/leaderboard`.
- Roll Call bills carry `passed` and `outcome`. That only matters for the agreement stat.

**Should:** captions go out as `{id, text}` only, and Landslide items without `yeas`/`nays`. Reveal the answers in the `POST /results` response or in `/me/history` after the game is finished.

**Cause:** `content.ts:78-86` (`setFor` returns payloads unchanged) and `games.ts:70-74`.

**Repro:** `01-cheater.mjs` checks `today leaks…` and `script gets perfect…`.

### H2. A parallel `done:false` un-finishes a game, which can then be replayed after the reveal

**Did:** for each of 40 users, sent `done:true` (all wrong) and `done:false` in parallel to `POST /results/filed-or-fake`.

**Happened**

- 22–31 of 40 games ended with `finished_at` NULL, after the player had already been told `score:0`.
- A replay with the right answers was then accepted every time, and the stored score went from 0 to 8.

**Should:** finishing is one-way.

**Cause:** the `finished()` check at `games.ts:195` is separate from the upsert at `games.ts:225-231`, which overwrites `finished_at` unconditionally.

**Fix:** add `ON CONFLICT … DO UPDATE … WHERE game_results.finished_at IS NULL`, and return `alreadyFinished` when no row was updated.

**Repro:** `02-races.mjs games` checks `fof: done:true score returned but game ends UNFINISHED` and `fof: unfinished-by-race game can be replayed…`.

### H3. Parallel finishing submits are all accepted, so the player keeps the better score

**Did**

- Filed or Fake: 5 parallel `done:true` posts with different answers, for 30 users.
- Landslide: the worst and the best order in parallel, for 40 users.

**Happened:** every burst returned several different "final" scores, and the last write was the one stored (30/30 and 40/40).

**Should:** the second request returns `alreadyFinished`.

**Cause:** same as H2, and the same fix applies.

**Repro:** `02-races.mjs games` checks `fof: 5-way burst…` and `landslide: two parallel orders both accepted`.

### H4. Area stats leak exact scores by differencing at n ≥ 5, and counts are shown at any n

**Did:** 4 accounts with known scores plus a target in Cheyenne. Separately, a 6th player joined 5 players nobody controlled.

**Happened**

- `byGame.filedOrFake.avgCorrect × n − known sum` recovered the target's exact Filed or Fake score. The same worked for Landslide.
- `round1` means are exact for n ≤ 9.
- A before/after comparison around the 6th player recovered that player's exact score and vote with no controlled accounts.
- `topPoints` equals the target's total when they are top.
- `GET /leaderboard`'s `beyond` average narrows a total to a window 5 points wide.
- `players`, `bills[].voters` and `byGame.*.players` are returned even at 1–4 players, which gives event timing.
- Moving ZIP re-homes past results, so leaving a city of 6 or fewer exposes your score.

**Should**

- Coarser output at small n: no `topPoints`, rounded or bucketed means, or a larger k.
- Null the counts below the threshold.
- Snapshot the area on the result row.

**Cause**

- `social.ts:183-190`, `230-250`: means, `topPoints`, `byGame`.
- `social.ts:238`, `247-250`, `214-219`: counts.
- `social.ts:147`: `beyond`.
- `social.ts:156-178`: live `users.state/city` join.

**Repro:** `05-area.mjs` checks A0, A4–A7, A10, A11, B1–B4 and D1–D4.

### H5. The group cap of 50 can be exceeded

**Did**

- 55 parallel joins into an empty group.
- 40 parallel joins into a group with 5 free slots (prefilled by SQL).
- 30 parallel approvals with 5 free slots.

**Happened**

- The empty group ended with 56 members.
- The 5-slot join test ended with 84–85 members; 39–40 joins got 200.
- The approval test ended with 69–71 members.
- One user double-tapping Join (30 parallel) got 500 on 27 of the 30 requests, from the PK violation.

**Should:** never more than 50 active members. A repeated join returns the existing membership.

**Cause:** count-then-insert at `groups.ts:173/176` (join) and `groups.ts:249/251` (approve), with no lock. The membership check at `groups.ts:171` races the insert.

**Fix:** `SELECT … FROM groups WHERE id = $1 FOR UPDATE` inside a transaction, plus `ON CONFLICT DO NOTHING` on the member insert.

**Repro:** `02-races.mjs groups` checks `groups:` (overfill and double-tap). `04-groups.mjs` check `50-member cap broken by parallel joins`.

### H6. A bill repeated on a later day makes Roll Call unfinishable and rewrites old votes

**Did:** copied the 10-25 set to day 10-26 in the local database. No current data repeats a bill, so this is simulated. A player finished 10-25 voting all yea, then voted nay on 10-26.

**Happened**

- Every `POST /votes` returned 200, but each row kept `day=2026-10-25` and had its vote flipped.
- 10-26 progress showed 0 votes.
- `POST /results/roll-call` returned 400 "Vote on every bill first." every time. `/votes/reset` couldn't help. The player is stuck.
- The 10-25 history now shows 5 nays.

**Should:** key votes by `(user_id, day, bill_id)`, or at least `SET day = EXCLUDED.day` in the upsert. The seeder should also refuse to repeat a bill.

**Cause:** `server/migrations/001_init.sql:47-54` (the PK), `games.ts:167-171` (`ON CONFLICT (user_id, bill_id)`), and day-filtered reads at `games.ts:26-29` and `201-207`.

**Repro:** `07-mover.mjs` H3, H3b, H3c. `01-cheater.mjs` checks `re-voting a bill that has an older vote keeps the OLD day` and `Roll Call blocked…`.

### H7. Friend agreement is recomputed live over unfinished votes and exposed as an exact count

This finding comes from code review only, so it has no repro script.

**Problem**

- `agreementBetween` (`social.ts:58-81`) joins all of both players' votes on any day, including today's unfinished, still-changeable votes.
- `GET /friends/:id` then returns the exact `agreedCount`, and `/friends` returns the percentage, once 10 bills are shared. Topics show at 5 per topic.
- The value is recomputed on every request. So a player's own vote edits (`POST /votes`, `/votes/reset`) move a number that also depends on the friend's individual votes.
- The 10-bill guard limits only the population size, not changes over time. It does not uphold the stated rule that per-bill votes are visible only under mutual sharing (`social.ts:47`, `mutualSharing`).

**Made easier by**

- Invite tokens never expire, have no revoke route (`revoked` is never set), and make anyone holding the link an instant friend without approval (`social.ts:278-284`, `453-464`).
- A block racing an accept can leave a friendship (M2).

**Should**

- Compute agreement only over finished Roll Calls from earlier days (or snapshot it daily), so a player's live edits can't move it.
- Consider dropping the exact `agreedCount`.
- Make invites expire and be revocable.

## Medium

### M1. Votes still land after Roll Call is locked, and reset can lock in a Roll Call with zero votes

**Did and happened**

- 5 nay votes sent in parallel with `POST /results/roll-call`: in 28–30 of 30 runs the stored score doesn't match the final votes. History shows a score that doesn't match its own rows.
- `/votes/reset` delayed about 12 ms after the submit: 4–6 of 48 users ended with Roll Call finished, zero votes, and the flat 5 leaderboard points.

**Should:** votes are frozen once Roll Call is in, and a finished Roll Call always has every vote on file.

**Cause:** check-then-act at `games.ts:161-173` (votes), `176-179` (reset) and `202` / `225` (results).

**Fix:** run the vote upsert and delete with `WHERE NOT EXISTS (finished roll-call row)`, or lock everything in one transaction.

**Repro:** `02-races.mjs roll`.

### M2. A block racing an accept leaves the pair friends

**Did:** B accepted A's request while A blocked B, 30 pairs. Separately, an invite accept raced the inviter's block, 30 pairs.

**Happened**

- Both a `blocks` row and a `friendships` row existed in 5 of 30 request pairs and 29–30 of 30 invite pairs.
- `friendIds` and `/friends` don't filter blocks.

**Cause:** `social.ts:458-460` (`isBlocked`, then `befriend`) races `social.ts:387-393` (block: `unfriend`, then insert).

**Fix:** block in one transaction, and `befriend` re-checks blocks in the same statement.

**Repro:** `02-races.mjs friends` checks `friends: block racing accept…` and `invites: invite accept racing inviter's block…`.

### M3. Fastify 4xx errors and bad params come back as 500

**Happened:** each of these returns 500 "Something went wrong on our end." and is logged as an error:

- Malformed JSON, an empty body with a JSON content type, form-urlencoded bodies, any body containing a `"__proto__"` key, and bodies over 1 MB. Unauthenticated callers get this too.
- Non-uuid `/groups/:id` on 6 routes.
- `/friend-requests/abc/accept`.
- `/leaderboard/area/*?day=2026-02-30`.
- `/votes/reset {day:"abc"}`.
- A NUL byte in any path param or body string.
- `POST /blocks` with an unknown uid. The FK violation makes this a uid-existence oracle.

**Should:** 400, 404, 413 or 415.

**Cause**

- `index.ts:18-22`: the error handler maps every non-Zod error to 500. Fix: honour `err.statusCode < 500`.
- Unvalidated `day`, uuid and bigserial params: `games.ts:176-179`, `195`; `groups.ts:38`, `181`, `222`; `social.ts:331`, `429-432`.

**Repro:** `06-spam-fuzz.mjs` checks the `A…` and `G…` lines. `01-cheater.mjs` checks `POST /votes malformed json…` and `/votes/reset day=…`.

### M4. Moving mid-day corrupts history and progress, and re-homes past scores

**Did:** finished games in Austin, then moved to 90210 and later to 03301.

**Happened**

- `/me/history` re-renders each past day using the player's current place:
  - A Roll Call finished in TX lists 2 of 5 bills.
  - Filed or Fake shows 8/8 with every `answeredReal` null against CA captions.
  - Landslide shows 12/12 with `items: []`.
- `/today` progress lists votes and answers from the old ballot.
- `/me` reports `billsVoted=8` for one 5-bill Roll Call.
- The mover's finished scores show up on the new state's area board.

**Should:** store the ballot or scope the player actually played with the result, and render history from that.

**Cause**

- `games.ts:81`: `setForUser(uid, r.day)` uses the current place.
- `games.ts:28-48`: `progressFor` has no ballot filter.
- `me.ts:33-38`: stats.
- `social.ts:166-183`: area joins the current `users.state`.

**Repro:** `07-mover.mjs` B1–B10, C1–C7, D1. `01-cheater.mjs` check `stats count votes on bills outside the finished set`.

### M5. With no set for a day, yesterday's ballot is served forever and streaks break

**Did:** a second local server with a Date shim, crossing midnight into 10-26 and 10-27 with no set for those days.

**Happened**

- `/today` kept serving 10-25. A brand-new player could still vote on it on 10-27.
- A daily player's streak dropped to 0 by 10-27, because results land under day 10-25.
- When a 10-26 set does exist, the rollover is correct.

**Should:** a "no ballot today" state that doesn't count against streaks, or an ops alert.

**Cause:** `content.ts:49-53` (falls back to the latest day ≤ today), `games.ts:60-63`, and `me.ts:23-27` (streak loop from `centralDay()`).

**Repro:** `07-mover.mjs` G1–G4.

### M6. Admin leaving or deleting their account orphans or destroys the group, and DELETE /me can 500

**Happened**

- An admin calling `DELETE …/members/me` leaves the group with no admin. Pending joiners can never be approved, and preview still shows the old admin.
- An admin's `DELETE /me`, including a long-departed admin's, deletes the group for every member.
- `DELETE /me` raced with `POST /groups` returned 500 in 5 of 6 rounds and left the user row in place.

**Should:** promote the oldest member or refuse the leave, and transfer the group on delete. Run both deletes in one transaction, or cascade `groups.admin_id`.

**Cause:** `groups.ts:256-261`, `me.ts:220-223`, and `server/migrations/001_init.sql:104` (no cascade).

**Repro:** `04-groups.mjs` checks `admin leaving…` and `deleting the account of a long-gone admin…`. `07-mover.mjs` E2 and E9.

### M7. Display-name impersonation, including a player named "You"

**Happened**

- A player can set `displayName: "You"` and appears as a second "You" on friend and group boards.
- Duplicate names can't be told apart: friend lists and requests show only `name`, no username.
- Blank, zero-width-only, RTL-override and newline names are all accepted.

**Should:** trim the name, strip control and format characters, reject "You" and blank names, and show the @username next to the name.

**Cause:** `me.ts:83` (`z.string().min(1).max(60)`); `nameOf` in `social.ts`; `groups.ts:46`.

**Repro:** `06-spam-fuzz.mjs` checks the `B…` lines.

### M8. Demo accounts count toward area thresholds

**Happened:** 4 real players plus 1 `is_demo` player (set by SQL) gave `players=5` and revealed averages. Seeded demo scores are known, so demo accounts act as free sybils. That they are known is inferred from `seed-demo.ts`.

**Should:** filter out `is_demo` in the area queries.

**Cause:** `social.ts:140-146` and `172-178`.

**Repro:** `05-area.mjs` F1.

### M9. No rate limiting

**Happened**

- Ignore-then-re-request worked 15 times in a row, leaving 15 permanent rows.
- 20 requests to strangers in one burst all succeeded.
- Group-code guessing ran at about 3,300/s with no 429. The code space is 32⁶, and preview leaks `adminName`.
- One user could create unlimited groups.

**Should:** per-user throttles on requests, joins and previews, a re-request cooldown after an ignore, and a cap on groups per user.

**Cause:** no rate-limit plugin in `index.ts`; `social.ts:409-424`; `groups.ts:146`, `167`.

**Repro:** `06-spam-fuzz.mjs` checks the `C…` and `L…` lines. `04-groups.mjs` check `no rate limit on code guessing…`.

### M10. An expired friend request silently blocks every new request from that sender

**Did:** backdated a pending request by 45 days.

**Happened**

- The recipient no longer sees it, because of the 30-day TTL.
- A new request returns `{ok:true}` but is swallowed by the unique pending index.
- The hidden old request can still be accepted by id.

**Cause:** `social.ts:313` (TTL applied only on read) and `social.ts:418-422`.

**Repro:** `06-spam-fuzz.mjs` check `C re-request after 30-day expiry…`.

## Low

- **L1. Roll Call `score` stores the agreement count, not the flat 5** (`games.ts:208`). Leaderboards are correct because `POINTS_SQL` uses 5. But the `/results` response, `progress.rollCallAgreed`, history (for example "0 of 5") and the area `avgAgreedPct` all present agreement as the score. Repro: `01-cheater.mjs`.
- **L2. `PATCH /me` accepts `zip` with no lookup** (`me.ts:88`, `106`). State, city and districts go stale: lawmakers follow the new ZIP while the boards keep the old area. Fix: drop `zip` from `profilePatch`. Repro: `06-spam-fuzz.mjs` `J…`.
- **L3. Landslide validation is bypassed by comma-joined ids** (`games.ts:217-218`, `sort().join()`). A 3-entry order is accepted. There is no score gain. Repro: `01-cheater.mjs`.
- **L4. `/votes/reset` validates nothing.** It wipes unfinished votes on any day, and Postgres aliases like `"today"` pass (`games.ts:176-179`).
- **L5. Unbounded strings.**
  - `issues` entries have no length cap, so `GET /me` returns about 1 MB (`me.ts:89`).
  - `/friend-requests` usernames have no max and are echoed back in the 404 (`social.ts:409-414`).
- **L6. Username enumeration.** `PATCH /me {username}` returns 409 for private users (`me.ts:210`). Freed usernames, including those of deleted accounts, can be claimed instantly. Names like admin, docket and support can be claimed by anyone.
- **L7. Crossing requests and accept/ignore races.**
  - A→B and B→A requests both stay pending.
  - Accept and ignore racing can both return 200 (`social.ts:435`, no `status='pending'` guard).
  - 20 parallel `POST /invites` created 13 live tokens (`social.ts:278-284`).
- **L8. `badgeFor` edge cases** (`groups.ts:24-32`). Emoji-only or punctuation-only names give `''`. Astral letters give a lone surrogate. "A1 B2" gives "12".
- **L9. Misleading `{ok:true}` responses.**
  - Approving a uid that never asked.
  - A non-member calling `PATCH /groups/:id/me`.
  - Leaving and rejoining silently resets `include_in_splits`. Re-enabling it re-adds old votes retroactively.
- **L10. Lawmaker party leaks through profile text.** `party` is hidden when `shared=0`, but `background.text` names the party for 4 of 7 Austin lawmakers (`lawmakers.ts:157-159`).
- **L11. A deleted account re-creates itself on the next request** (`auth.ts:26-30`). No Firebase `deleteUser` or `revokeRefreshTokens` call exists. That the Firebase identity survives in production is inferred, not testable with the stub.
- **L12. Uneven daily sets (info).**

  | Player | Roll Call bills | Other games |
  |---|---|---|
  | Houston | 4 (no city items) | |
  | No ZIP | 2 | |
  | DC | | No Landslide rows, so the default Landslide, made of Texas bills |
  | Any state but TX, on 10-23 and 10-24 | National only | |

## Held up

- **Votes.** Voting on another state's bill, a past day's bill, or a nonexistent, empty, SQL-shaped or 100k-character id returns 400. Wrong, past, future or malformed days on `/votes` return 409.
- **Results.**
  - Sequential replays after finishing are refused (409 or `alreadyFinished`).
  - Unknown game names return 404.
  - Landslide rejects duplicates and orders of the wrong size.
  - Foreign Filed or Fake ids are filtered out.
  - Points never exceed 25.
- **Moving.** It doesn't allow a second Filed or Fake or Landslide play. Finishing the new ballot after a move works.
- **Account creation.** A burst of 320 first requests across 8 new uids gave exactly one row each and no 5xx.
- **Auth headers.** Missing, empty, lowercase and Basic schemes return 401. A 70 KB header returns 431.
- **Input validation.**
  - null, array, number or string bodies return 400.
  - Deeply nested JSON doesn't hang.
  - Usernames reject SQL shapes, homoglyphs and uppercase.
  - Path traversal returns 404.
  - `/geo` validation holds.
- **Friend requests.** The 404 is identical for missing, private, blocked and self targets, with no usable timing difference.
- **Groups.**
  - Pending members and non-members get 404 or 403 on group data and admin routes.
  - `reset-code` invalidates the old code.
  - The 5/10 voter minimum holds for a single snapshot.
  - Weekly board points are flat, so they never encode a vote.
  - Blocked pairs are hidden from each other's boards.
- **Area stats.** Below 5 players every average, rank and distribution is hidden. Past and future `day` values pick the right set. A player with no ZIP gets a clean 404 for city and state.
- **Lawmakers.** `/me/lawmakers` follows the ZIP, and unknown lawmaker ids return 404.

## Re-test after dbbaa7f

Same local stack and the same scripts, run again on `dbbaa7f`. Some checks were updated because the fixes changed response shapes or status codes:
- `04-groups.mjs` now treats a bill that is missing from `today[]` as 0 voters. Its split checks vote without finishing Roll Call. Those votes no longer count, so `control: 2 voters hidden`, `admin differencing`, `include_in_splits`, `dropping to 4` and `pending member vote` now print `BUG` with 0 voters. Those lines are artifacts. `08-groups-finished.mjs` repeats the split checks with finished Roll Calls.
- `01-cheater.mjs`: Filed or Fake answers are now locked once saved, so the foreign-ids check now compares the response with the client's score.
- `05-area.mjs` E1 and `07-mover.mjs` C9, C12 and H3c now accept the new 4xx codes and the area floor.

**Fixed (the check now holds):**
- **C1.**
  - Group and area splits count only finished Roll Calls. Votes from an unfinished Roll Call aren't counted (`08`: 5 voters while the target's unfinished vote is excluded).
  - A vote after lock-in returns 409.
  - Every hidden split gives the reason `few`, even when it is unanimous.
- **H2, H3, M1.**
  - `02-races.mjs games` and `roll` are clean: no un-finish, no replay, no double "final" score.
  - Votes don't land after lock-in, and a reset can't empty a finished Roll Call.
- **H4 (in part).** The area floor is 10. The 4-accounts-plus-1 score recovery (A4–A7, A10, A11) and the unfinished-vote checks (A1–A3) now hold.
- **H5.** No overfill on parallel joins or approvals, and no 500 on a double-tapped join.
- **H6 (in part).** A repeated bill can now be voted and Roll Call finished on day 2 (`07` H3).
- **H7.** `agreementBetween` (`social.ts`) now joins finished Roll Calls only, so a player's own unfinished vote edits can't move it. This is from code review.
- **M2.** Block racing accept and invite accept.
- **M3.**
  - `dbbaa7f`: Fastify's 4xx errors (bad JSON, 413, 415, `__proto__`) and invalid dates (area `day`, `/votes/reset`) now return 4xx.
  - `6d366ff`: Postgres invalid-input errors return 400 (non-uuid group ids, non-numeric request ids, NUL bytes). `POST /blocks` with an unknown uid returns `{ok:true}`, so it is no longer an oracle.
  - Re-test: `06-spam-fuzz.mjs` has no 5xx left, and spot checks on `/groups/not-a-uuid`, `/lawmakers/%00`, `/bills/%00` and `/groups/preview/%00` return 400.
- **M7 (in part).** A display name of "You" and blank or invisible names are refused.
- **L3, L4.** The comma-joined Landslide order is refused, and `/votes/reset` validates the day.
- **L5 (in part).** `issues` entries are capped.
- **L6 (in part).** Reserved usernames are refused.
- **L7 (in part).** Crossing requests between the same two people are handled.

**Still open:**
- **H1.** `/today` still ships `real`, `explanation`, `yeas` and `nays` (needs app changes).
- **C1 and H4 residual: differencing when membership changes.**
  - In a group, the 6th finisher's vote shows in the before/after split (5 voters at 60% to 6 at 50%).
  - An admin removing a member shows that member's vote the same way.
  - The area per-bill split does the same for a 6th voter (B3), including a hidden split turning visible (B4).
  - The backend treats this as inherent to aggregates. A daily snapshot, or hiding `voters` together with deltas, would close it.
  - Repro: `08` `residual:` checks, `05` B3 and B4.
- **H6 residual.** The upsert now moves the vote to the new day (`SET day = EXCLUDED.day`), so day 1's history and splits lose or flip it (`07` H3b). A `(user_id, day, bill_id)` key would keep both. This only bites if a bill repeats.
- **M4.** Moving re-homes history, progress and area stats (`07` B, C and D; `05` D1–D4).
- **M5.** With no set for the day, yesterday's ballot is still served and streaks break (`07` G1–G4).
- **M6.** Admin leaving orphans the group, and an admin's DELETE /me deletes it (`04`, `07` E2). DELETE /me racing POST /groups still returns 500 (`07` E9).
- **M7 residual.** Friend lists and `/friends/:id` still show only the name, so two people with the same name can't be told apart.
- **M8.** Demo accounts still count. The floor of 10 makes this harder.
- **M9.** No rate limits.
- **M10.** An expired request still blocks new ones, and is still acceptable by id.
- **Low items:**
  - L1: Roll Call score is still the agreement count.
  - L2: `PATCH /me` still accepts `zip`.
  - L5: the 900 KB username is still echoed back in the 404.
  - L6: username-taken 409, and usernames freed instantly.
  - L7: accept+ignore race (4/25) and multiple live invite tokens (15 from 20 parallel calls).
  - L8: `badgeFor` edge cases.
  - L9: `{ok:true}` no-ops.
  - L10: party in lawmaker background text.
  - L11: an account re-creates itself after delete.

