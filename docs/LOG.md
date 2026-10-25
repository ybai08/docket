# Docket build log

Newest first. Each commit adds a line or two here: what changed, what's live, what's left.

## 2026-10-25

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
