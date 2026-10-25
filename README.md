# Docket

Swipe through real Texas and Austin bills, play quick daily games, and see how your friends voted. Built at HackTX 2026.

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

Lawmakers, their recorded votes and the districts of every Texas ZIP code live in Postgres (`lawmakers`, `lawmaker_votes`, `zip_districts`), so the API never looks up districts or representatives at request time. `server/scripts/build_civic_data.py` rebuilds the JSON in `server/data/` from public sources, and `npm run seed` loads it:

- **Lawmakers:** Texas's members of Congress (unitedstates/congress-legislators, official portraits), all Texas legislators (OpenStates, with their official photos), and Austin's mayor and council (City of Austin).
- **Votes:** Congress from Voteview; Austin from the city's council votes dataset. Texas Legislature member votes aren't machine-readable yet.
- **ZIP districts:** Census 2020 relationship files for the 119th Congress, the 2024 Texas House and Senate plans, counties and cities, with the share of each ZIP in each district. Austin council districts come from the city's boundary map, by each ZIP's center point.

```bash
python3 -I server/scripts/build_civic_data.py   # when rosters or bills change
cd server && npm run seed
```

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
