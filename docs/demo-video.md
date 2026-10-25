# Demo video shot list

About 2 minutes. Record the iPhone simulator, then trim.

## Before recording

- Use an account that hasn't played today, or a fresh one. The demo friends and group come from `npm run seed:demo` in `server/`, which befriends every real account.
- Check the API is up: `curl https://api.docketapp.tech/health` (or `https://144-202-75-20.sslip.io/health` until the domain is live).
- Turn on Do Not Disturb so no notifications pop up.
- Start recording, and press Ctrl-C to stop:

```bash
xcrun simctl io booted recordVideo --codec=h264 ~/Desktop/docket-demo.mp4
```

## Shots

| # | Screen | What to do | Say (roughly) |
|---|---|---|---|
| 1 | Sign in | Hold on the VETOED card for a second, then Continue with Apple | "Docket is NYT-style daily games on real bills." |
| 2 | Onboarding | Type 78705, pause on "Your ballots will cover", then pick 3 issues and Start | "Your ZIP sets your Congress, Texas and Austin districts, from the Census." |
| 3 | Today | Pause on the three ballot stubs | "Three ballots a day: Roll Call, Filed or Fake, Landslide." |
| 4 | Roll Call | Swipe one card right, tap Nay on one, Yea the rest, then See results | "Real bills: a Texas phone ban, the TAKE IT DOWN Act, Austin zoning." |
| 5 | Results | Scroll slowly: squares, then the lawmaker sliders, stats and friends | "Agreement with the final vote. Teal is agreed, lavender disagreed; never red or blue." |
| 6 | Review | Open Review the 5 bills and show your senators' and rep's real votes | "Your own lawmakers' recorded votes, from the House Clerk and Voteview." |
| 7 | Share | Tap Share and pause on the text in the share sheet | "Spoiler-free: just squares and scores." |
| 8 | Filed or Fake | Answer one caption and let the FAKE stamp land | "Real captions straight from Texas Legislature Online. Every fake is stamped." |
| 9 | Landslide | Long-press, drag one row up, Lock in, then show the reveal | "Rank by the final House margin." |
| 10 | Friends | Leaderboard, then the Friends tab with requests | "Two-way friends only. No public profiles." |
| 11 | Invite | Tap Invite and show the QR code | "Invite by link or QR; scanning makes you friends right away." |
| 12 | Friend profile | Open Priya and point at the guard text, or at Recent bills if you both share | "Agreement shows only after 10 shared bills. Per-bill votes only if both share." |
| 13 | Group | Groups, then Jester West: weekly board and splits | "Group splits stay hidden until 5 members vote." |
| 14 | Profile | Scroll to Lawmakers you agree with, Congress tab | "And how often you agree with your actual lawmakers." |

## Stack callouts (end card)

- Expo SDK 58 / React Native, Expo Router native tabs, Reanimated and Gesture Handler
- Fastify API on a **Vultr** VM, Caddy for HTTPS
- **Tiger Data** (Timescale Cloud) Postgres: every agreement figure and privacy threshold is computed on the server
- Firebase Auth (Apple and Google)
- Data: Texas Legislature Online and House and Senate journals, House Clerk, Voteview, City of Austin open data, U.S. Census geocoder
