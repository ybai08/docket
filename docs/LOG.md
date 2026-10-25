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

### Other sessions
- UI: lawmaker, area breakdown, history and friend-request screens; streak popup (`70f7551`); bill screens fall back to `GET /bills/:id`.
- Promo video: `promo/out/docket-demo.mp4`.
- TestFlight: a separate session is setting up EAS Build and Submit.
