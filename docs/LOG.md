# Docket build log

Newest first. Each commit adds a line or two here: what changed, what's live, what's left.

## 2026-10-25

### Promo video and launch page
- Live: the hero's "See how it works" button now scrolls smoothly to "Three quick games. All real bills." instead of playing the demo (user request).
- Live on docketapp.tech, at the user's request: the "Built at HackTX 2026" badge and footer text are gone. The second hero button is now "See how it works" and plays the demo; the duplicate button below the video is removed. A note under the buttons says Docket runs in the browser for now, because Apple's TestFlight review for outside testers didn't finish before judging.
- Fixed since: deploy.sh now keeps the app.docketapp.tech block on full deploys (backend).
- Live: the playable web app at https://app.docketapp.tech. On desktop it shows inside an iPhone frame; on a phone it runs full-screen. `promo/deploy-app.sh` exports the web build, uploads it to /var/www/docket-app and adds its Caddy block. The API wasn't restarted, and CORS needed no change. The user added the IONOS A record and the Firebase authorized domain.
- Live: docketapp.tech now has "Try it in your browser" under the headline, "Try it" in the top bar and "Try Docket" at the end. The headline, buttons and demo video all fit on the first screen.
- Left: server/deploy/deploy.sh rewrites the whole Caddyfile, so it has to keep the app.docketapp.tech block (asked the backend session). Tabs weren't checked past sign-in, since nothing was signed in.
- Earlier today: `promo/` Remotion demo video (1:56, beat-synced original score), `promo/SCRIPT.md` voiceover script, and the launch page at docketapp.tech (`promo/site`, `promo/deploy-site.sh`), updated for the new privacy rules.

### QA
- `docs/QA_REPORT.md`: break-testing the API with simulated players (cheater, races, groups, area leaderboard, spammer/fuzzer, a player who moves states). Found 1 critical, 7 high, 10 medium and 12 low issues. The worst: group and area vote splits reveal one person's vote, `/today` ships the Filed or Fake and Landslide answers, and parallel submits can un-finish and replay a game. Sent to the backend session; no server code changed.
- `server/qa/`: rerunnable repro scripts, plus `start-local.sh`, which runs the API against its own Docker Postgres with stubbed auth. Production was never touched.
- Re-tested the backend's fixes (`dbbaa7f`) with every script; the report now has a Status column. Fixed: replays and double submits, votes after lock-in, the group cap, splits and agreement counting unfinished votes, block-vs-accept, and Fastify 4xx errors that came back as 500. Still open: the `/today` answers, differencing when group or area membership changes, some 500s (non-uuid group ids, NUL bytes, non-numeric request ids), moving states, and no set for a new day. Added `08-groups-finished.mjs`, and updated checks the fixes made stale.
- Re-tested `6d366ff`: malformed ids and NUL bytes now return 400, and blocking an unknown uid no longer reveals whether it exists. The spam/fuzz script has no 500s left. The report marks M3 fixed.

### Deploy keeps the web app (backend)
- `server/deploy/deploy.sh` now writes the `app.docketapp.tech` Caddy block (the playable web app from `promo/deploy-app.sh`) whenever `/var/www/docket-app` exists, so a full deploy no longer drops it. Checked after a full deploy: the launch page, share links and the API respond, and the web app serves 200 when reached by the server IP (this Mac's DNS cache hadn't picked up the new name yet).

### More QA fixes (backend)
- Malformed input that Postgres rejects (a non-uuid group id, a NUL byte, an out-of-range number) now gets a 400, not a 500. Blocking an unknown user id returns ok without blocking anything, so it can't be used to probe for accounts.
- Left for after judging: what happens when a group's admin leaves or deletes their account, and keeping a vote on both days if a bill ever repeats.

### Web demo CORS (backend)
- The API now allows PATCH, PUT and DELETE from browsers, so the web demo at yangbai-docket.expo.app can save profile changes after sign-in. Before this, the cors plugin allowed only GET, HEAD and POST.

### All 50 states live, and QA fixes (backend)
- Wisconsin, West Virginia and Georgia added from their legislatures' sites (Georgia's Landslide too). Every state now gets its own bills: 49 from state data plus Texas's curated set, 546 state bills in all. Only D.C.'s Landslide and Puerto Rico still use the default.
- Fixed from the QA report (`docs/QA_REPORT.md`):
  - A finished game can't be un-finished, replayed or double-submitted: the upsert only touches unfinished rows, and each player-day's writes are serialized.
  - Votes and resets can't slip past a locked Roll Call; reset only works on today's ballot.
  - Group and area vote splits, and friend agreement, count only finished Roll Calls. Hidden splits give one neutral reason. Area stats need 10 players.
  - Group joins and approvals can't overfill a group; a double-tapped join no longer 500s.
  - Friend accept, ignore and block are atomic per pair, so a block can't lose to an accept; crossing requests make friends.
  - Fastify's 4xx errors (bad JSON, too large) stay 4xx; bad dates are 400s, not 500s.
  - Invisible and control characters are stripped from names and issues, "You" can't be a display name, and admin-like usernames are reserved.
  - A Landslide order must be exactly the four bills.
- Not changed yet: `/today` still sends Filed or Fake answers and Landslide tallies before you play, so a script can get a perfect score. Hiding them needs matching app changes.

### Every state's bills: 48 of 50 states live (backend)
- Added Virginia, Washington and Wyoming (LIS data files, the Washington Legislature web services, the Wyoming LSO API) and Arkansas, Kansas and New Mexico (arkleg.state.ar.us, the Kansas KLISS API, nmlegis.gov). Each has 11 bills, with every tally checked against the official record. 520 state bills in all; seeded and live.
- All 50 states except Wisconsin and West Virginia now get their own bills; Texas keeps its curated set. Those two, and a better Georgia Landslide, are being gathered from their legislatures' sites. Puerto Rico still uses the default set: its bill titles are in Spanish and don't have plain-English text yet.

### Deploy keeps the launch page (backend)
- `server/deploy/deploy.sh` now ships `promo/site` (the HackTX launch page at docketapp.tech) next to the share-link page, without `--delete`, and serves `/` as the launch page. `/invite/*` and `/group/*` rewrite to `open.html`, `/media/*` is cached for a day, and unknown paths return 404. Checked after a full deploy: all of those work, the video serves byte ranges, and the API health check is 200.
- Cleared the test account's Landslide for today a second time. The 09:13 lock submitted the untouched starting order, which is what pressing "Lock in" without dragging does.

### Every state's bills: 42 places live (backend)
- Seeded and live: 39 states from Open States (Alabama through Vermont, minus Arkansas, Kansas and New Mexico), Massachusetts and New Hampshire from their legislatures' own sites, and D.C. That's 454 bills with recorded floor tallies and outcomes, and about 43,000 member votes for legislators still in office.
- Each player's Roll Call is Congress's 2 bills plus 3 from their state; Texans keep the curated Texas and Austin set. Filed or Fake (4 real, 4 fake) and Landslide come from their state. Georgia and D.C. use the default Landslide (too few distinct margins).
- Plain-English titles, short titles, summaries and topics are written only from each bill's official title and abstract (`server/data/state-bill-text.json`).
- Open States' free key allows 250 requests a day, and it's used up. Virginia, Washington, West Virginia, Wisconsin, Wyoming, Georgia's Landslide, Arkansas, Kansas and New Mexico are being gathered from official legislature sites. Until then those players get Congress's bills plus the default Texas Filed or Fake and Landslide.
- Data files are gzipped (`state-bill-picks.json.gz`, `state-content.json.gz`).

### Every state's bills (backend, in progress)
- Daily sets are now per player: Roll Call = Congress + the player's state (+ Austin for Austin). Filed or Fake and Landslide use the player's state, else the default Texas set. Migration 008 (`daily_sets.scope`) is applied and the code is deployed; state rows aren't seeded yet, so players still see the Texas and Congress set.
- New `GET /bills/:id` for bills the app doesn't ship. `GET /friends/:id` recent votes now carry `billId`.
- Open States fetch (`server/scripts/fetch_state_bills.py`): 44 of 50 states checked so far. 38 have full sets (3 Roll Call, 4 Landslide, 4 real Filed or Fake bills, all with recorded floor tallies and outcomes). Georgia and Minnesota should complete on a rerun with the any-chamber Landslide fix. Virginia, Washington, West Virginia, Wisconsin and Wyoming are still fetching.
- Massachusetts and New Hampshire: 11 bills each, verified against malegislature.gov and gc.nh.gov. Arkansas, Kansas and New Mexico: being gathered from their legislatures' own sites.
- Next: plain-English titles for every picked bill, then seed, deploy and check with test ZIP codes from several states.

### Earlier today (backend)
- `5a696ba`, `50b1f40`: per-game history (`GET /me/history/:game`), with days that have no stored set shown as score-only.
- `a6b1711`: lawmaker profiles (Wikipedia openings for 7,520 lawmakers, links, committees) and the Leaderboard area breakdown.
- `9d6407b`: civic data for the whole country: 7,967 lawmakers, 6,457 photos served by the API, every U.S. ZIP code, 99% of state seats matched.
- Re-seeded the plain-English Filed or Fake captions; deleted the test account's accidental 0/12 Landslide for today.

### UI
- Web tabs scroll again. expo-router's TabSlot let the focused screen grow to its full content height, so the tab's ScrollView had nothing to scroll in. The web tab layout now holds each screen to the viewport. Checked on local web: Today in a 560pt window scrolls, and it didn't before the fix. Pushed screens (bill page) already scrolled. Needs a web redeploy.
- Web tab bar: `src/app/(tabs)/_layout.web.tsx` replaces the web's top tab strip with the iOS-style floating pill at the bottom (Today / Friends / Profile, SF Symbol look-alike icons, a grey capsule behind the selected tab). Tab screens leave room for it on the web. iOS is unchanged. Needs a web redeploy. Signed-in web screens are still unchecked.
- Web dialogs fixed: Sign out, block/remove/share, leave group, the group admin menu, reset code, rename, unblock, delete account and the username prompt all go through `src/components/dialog.tsx`. iOS keeps its native dialogs. On the web a single choice uses the browser's confirm or prompt, and menus with several choices use an in-app sheet. Needs a web redeploy to reach the judge demo.
- Hidden vote splits in groups and the area breakdown now all say "Hidden so no one's vote can be guessed", matching backend `dbbaa7f`, which dropped 'unanimous'. The area page's player threshold comes from the server's `minPlayers` (now 10). Live in the app now.
- Landslide drag fix: rows used to move only after a long press, so pressing and dragging right away (as with a mouse on the simulator) did nothing. Dragging now starts on any vertical move. Also fixed the Reanimated "read during render" warning from the rows. Tested on a temporary harness, since today's test-account Landslide was locked again.
- Filed or Fake results: a cream score card with one teal or lavender tile per bill, and rows with a check or cross, the FILED/FAKE stamp and your answer. The text is easier to read. Real bills open their bill page. Live in the app now.
- Earlier today (`852cb4f` to `70f7551`):
  - Friends: Leaderboard and Friends tabs rebuilt as plain lists, a friend's profile with a You / friend vote table, a limited profile for pending requests, an area breakdown behind "Beyond your friends".
  - New screens: bill and lawmaker pages, per-game history from Profile, an in-app How to play sheet, the streak popup and a full-width Invite sheet.
  - Screens now fetch bills from `GET /bills/:id` when needed, and bill counts and place names work for any state.

### Other sessions
- UI: lawmaker, area breakdown, history and friend-request screens; streak popup (`70f7551`); bill screens fall back to `GET /bills/:id`.
- Promo video: `promo/out/docket-demo.mp4`.
- TestFlight: a separate session is setting up EAS Build and Submit.

### TestFlight setup (build session)
- `eas.json`: development, preview and production profiles. Production bumps the build number remotely (`appVersionSource: remote`).
- Linked EAS project `@yangbai/docket` (`extra.eas.projectId`, `owner` in `app.json`). Set `ios.config.usesNonExemptEncryption: false`.
- All ten `EXPO_PUBLIC_*` values from `.env` are EAS env vars (sensitive) in production, preview and development. The production config resolves the Google URL scheme without `.env`.
- Next: the first production iOS build, run by hand for the Apple login and 2FA, then submit to TestFlight.
- First TestFlight build is live: 1.0.0 (1), EAS build `f1bb8593`, submission `e72b21d4`, from `4eb52f8`. Apple processing `VALID`, internal testing `IN_BETA_TESTING`, external `READY_FOR_BETA_SUBMISSION`. App Store Connect app id `6826853964` is now in `eas.json`, so `eas build -p ios --profile production --auto-submit` runs without prompts.
- App icon: the serif "D" monogram on cream with a yellow highlighter swipe (option 1 of 5 in `design/icon-options/`). Also the Android adaptive icon (cream background, foreground and monochrome in the safe zone) and the web favicon.
- Web backup demo: https://yangbai-docket.expo.app (EAS Hosting, `npx expo export -p web` then `eas deploy --prod`). The sign-in screen loads; the API's CORS already allows it. Google sign-in there needs `yangbai-docket.expo.app` in Firebase Auth's authorized domains. Apple sign-in is iOS only. Favicon is the monogram at 192px.
- TestFlight build 2 (new icon): EAS build `cf5fdede`, submission `debc2c4c`, from `b3722e7`.
- Web demo in an iPhone frame: on a desktop browser, `public/index.html` (the web template) redirects to `public/demo.html`, which draws an iPhone-sized device (402 x 874, status bar, Dynamic Island, home indicator) around the app in a same-origin iframe, with a short intro beside it. Phones and narrow windows get the app full screen. Redeploy after changes with `npx expo export -p web` and `eas deploy --prod`.
- Web demo redeployed with the UI session's web dialog fix (`203f57b`). Sign out and the other confirms need a signed-in check on the web.
