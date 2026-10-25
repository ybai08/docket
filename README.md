# Docket

Swipe through real bills from Congress, your own state legislature and (in Austin) your city council, play quick daily games, and see how your friends voted. Works for every U.S. ZIP code. Built at HackTX 2026.

Stack: Expo (React Native, Expo Router) + Firebase Auth, and a Fastify + Postgres API in `server/`. Sign-in is Google (iOS, Android, web) and Apple (iOS only).

## Run it

Google Sign-In uses native code, so the app runs as a **development build**, not in Expo Go.

```bash
npm install
cp .env.example .env    # then fill in the values (see Firebase setup)
npm run ios             # builds the native app and opens it in the iOS Simulator
```

If `npm run ios` says "No code signing certificates are available" for a simulator (Expo CLI can misread new simulators as physical devices), build with Xcode directly, then start Metro:

```bash
xcodebuild -workspace ios/Docket.xcworkspace -scheme Docket -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 18 Pro' -derivedDataPath ios/build build
xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/Docket.app
npx expo start --dev-client   # then open Docket in the simulator
```

After the first build, `npx expo start` is enough until native config changes. Rebuild with `npm run ios` whenever you change `app.json`, `app.config.ts`, the Google client IDs in `.env`, or add a package with native code.

`npm run web` works too (Google popup only).

## Firebase setup

1. **Authentication > Sign-in method**: enable **Google** and **Apple**. Disable **Email/Password**.
2. **Google**: open the Google provider, copy the **Web client ID** under "Web SDK configuration" into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
3. **Project settings > Your apps > Add app > iOS**: bundle ID `com.ybai08.docket`. Download `GoogleService-Info.plist` and copy its `CLIENT_ID` into `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`. Do not commit the plist.
4. **Apple** needs a paid Apple Developer account: in developer.apple.com, enable **Sign in with Apple** on the App ID `com.ybai08.docket`. For iOS-only sign-in, Firebase's Apple provider needs no Services ID or key.

## Run the API locally

The app talks to `server/` with the signed-in user's Firebase ID token. Votes, results, streaks and stats live in Postgres; the app keeps a local copy so it still works offline.

```bash
docker run -d --name docket-pg -e POSTGRES_USER=docket -e POSTGRES_PASSWORD=docket -e POSTGRES_DB=docket -p 5432:5432 postgres:16
cd server
npm install
cp .env.example .env    # DATABASE_URL, and FIREBASE_PROJECT_ID (same as the app's)
npm run migrate         # applies migrations/*.sql once each
npm run seed            # loads the verified bills, daily sets, lawmakers and ZIP districts
npm run dev             # http://localhost:8787, reloads on change
```

The iOS Simulator reaches `localhost` directly. For a phone, set `EXPO_PUBLIC_API_URL` in the app's `.env` to an address it can reach. Hosted Postgres (Tiger Cloud) works the same: put its connection string in `DATABASE_URL`. Tiger Cloud signs with its own CA, so `server/certs/timescale-ca.pem` is pinned and TLS stays fully verified; other hosts must present a publicly trusted certificate.

Endpoints (all need `Authorization: Bearer <Firebase ID token>`): `GET /today`, `POST /votes`, `POST /votes/reset`, `POST /results/:game`, `GET /results/today`, `GET /me`, `PATCH /me`.

## Civic data

Every current member of Congress and state legislator in the country, their photos, their recorded votes on Docket's bills, and the districts of every U.S. ZIP code live with the API: rows in Postgres (`lawmakers`, `lawmaker_votes`, `zip_districts`) and photos in `server/media/photos`, served at `/photos/<id>.jpg`. The API never looks up districts, representatives or photos elsewhere at request time. `server/scripts/build_civic_data.py` rebuilds `server/data/` and the photos from public sources, and `npm run seed` loads the data:

- **Lawmakers:** Congress, including non-voting delegates (unitedstates/congress-legislators, official portraits); every state legislature plus the D.C. Council (OpenStates, with their official photos where the state publishes one); and Austin's mayor and council (City of Austin). Photos are resized to 240px and stored, about 6,500 of them.
- **Votes:** Congress from Voteview; Austin from the city's council votes dataset; the Texas Legislature from the House and Senate journals (`server/scripts/tx_journals.py`, which needs `pdftotext` from poppler). Every parsed vote must add up to the tally the app shows, or the build stops.
- **ZIP districts:** Census 2020 relationship files for the 119th Congress, the 2024 state legislative plans, counties and cities, with the share of each ZIP in each district; a ZIP that straddles districts uses the one covering most of it. Census and OpenStates name districts differently, so both are normalized to a `district_key`; the build prints how many state seats matched a ZIP (99%; the rest are New Hampshire's floterial seats, small Wyoming districts inside larger ZIPs, and Maine's non-voting tribal seats). Austin council districts come from the city's boundary map, by each ZIP's center point.
- **Profiles:** `server/scripts/build_lawmaker_profiles.py` adds, per lawmaker, the opening sentences of their English Wikipedia article (CC BY-SA 4.0, credited and linked; about 7,500 lawmakers), official and Ballotpedia links, the year they took their current seat and committee assignments (Congress). Articles are found only by exact identifier (congress-legislators' Wikipedia title, the Wikidata ID OpenStates records, or a Wikipedia link in OpenStates' sources), never by name search. Campaign platforms are not stored: no public bulk source has them without an API key.

```bash
python3 server/scripts/build_civic_data.py   # when rosters or bills change (needs pdftotext and macOS sips; ~20 min)
python3 server/scripts/build_lawmaker_profiles.py   # after it (~15 min the first time; Wikipedia intros are cached)
cd server && npm run seed
```

## Daily sets by place

Each player's daily set depends on where they live (`daily_sets.scope`: `''` for everyone, a state like `CA`, or a city like `TX/Austin`). Roll Call is Congress's bills plus the player's state's and city's; Filed or Fake and Landslide come from the most specific place that has them, falling back to the default (Texas) set. Congress, Texas and Austin content is curated by hand in `src/data`; every other state's comes from its legislature's record:

1. `server/scripts/fetch_state_bills.py` (needs `OPENSTATES_API_KEY` in `server/.env`) pulls each state's recent bills from Open States and keeps those with a recorded floor tally and a final outcome (signed, became law, vetoed, or failed a floor vote). Named member votes must add up to the counts; tallies written only in the state's action text ("Yeas 39 to Nays 0") are parsed without member votes. It picks 3 Roll Call bills, 4 Landslide bills voted in one chamber with distinct margins, and 4 real Filed or Fake bills per state into `server/data/state-bill-picks.json`.
2. States Open States has no votes for are gathered from the legislature's own site in the same shape into `server/data/state-bill-picks-extra.json`, each tally checked against the official page in `sourceUrl`.
3. `server/data/state-bill-text.json` holds a plain-English title, short title, summary and topic for each picked bill, written only from its official title and abstract.
4. `server/scripts/build_state_content.py` combines them, adds four state-neutral fake captions per state, and writes `server/data/state-content.json`, which `npm run seed` loads (bills, daily set rows, and member votes for legislators still in office).

```bash
python3 server/scripts/fetch_state_bills.py      # ~30 min; responses are cached
python3 server/scripts/build_state_content.py
cd server && npm run seed
```

The progress log is in [docs/LOG.md](docs/LOG.md).

## Deploy the API

The API runs on a Vultr VM (Ubuntu 24.04) behind Caddy, which gets HTTPS certificates from Let's Encrypt. Production is `https://api.docketapp.tech` for the API and `https://docketapp.tech` for the page share links open (`/invite/<token>`, `/group/<code>`), which hands off to the app. Without a domain, `<ip-with-dashes>.sslip.io` works as the API host.

```bash
ssh root@<ip> 'bash -s' < server/deploy/provision.sh       # once: Node 22, Caddy, firewall (22/80/443), swap
server/deploy/deploy.sh <ip> api.docketapp.tech docketapp.tech   # every release: code, .env, npm ci, restart
```

`deploy.sh` copies `DATABASE_URL` and `FIREBASE_PROJECT_ID` from `server/.env` to the VM (mode 600) and runs the API as the `docket` systemd service on localhost:8787. It uses `~/.ssh/docket_vultr` unless `DOCKET_SSH_KEY` says otherwise. Point the app at it with `EXPO_PUBLIC_API_URL=https://api.docketapp.tech` and `EXPO_PUBLIC_LINK_BASE=https://docketapp.tech` in `.env`, then restart Metro.

## Layout

- `src/app/` — screens (Expo Router). `sign-in.tsx` and the `(tabs)` group (Today, Friends, Profile) plus the game screens are guarded in `_layout.tsx`.
- `src/theme/` — design tokens from `design/`: palette, Newsreader + system type, spacing, radius. Light only.
- `src/components/` — shared pieces: pill buttons, bill chip and card, ballot stub card, progress tiles, stamp, vote slider.
- `src/data/` — verified seed content (bills, captions, Landslide tallies) and the daily sets.
- `src/lib/use-today.tsx` — today's set and progress, synced with the API; `rules.ts` holds the scoring shared with the server.
- `server/` — Fastify API, SQL migrations and the seed script.
- `src/lib/auth-context.tsx` — auth state, sign-in/out, error messages.
- `src/lib/social-auth.native.ts` / `social-auth.ts` — Google and Apple sign-in for iOS/Android and web.
- `src/lib/firebase.native.ts` / `firebase.ts` — Firebase Auth setup for iOS/Android and web.
