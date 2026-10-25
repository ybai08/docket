# Build Docket: implementation brief

Paste everything below into a new Claude Code chat (Opus 5.5) opened in `~/Desktop/docket`.

---

You are the lead engineer building **Docket**, an iPhone-first app for HackTX 2026 (UT Austin). Submissions close **11:30 AM CST, Sunday October 25, 2026**, and a demo video is required, so every slice must leave the app in a demoable state. Build it slice by slice, in the order below, keeping a task list as you go.

## 1. What Docket is

Daily political mini-games on **real bills**, in the spirit of NYT Games:

- Every day there is a fixed set of three "ballots" (games), a streak, and a spoiler-free result to share.
- Bills come from **Congress, the player's state legislature, and their city and county**. The ZIP code entered at onboarding sets state, county and city.
- Players see how often they agree with the final vote, with friends, and with their own lawmakers.
- It must feel **nonpartisan**: no party labels on bill cards, never red or blue for agree or disagree, and both sides presented evenly.

The three games:

1. **Roll Call:** vote Yea or Nay on 5 real bills (a mix of Congress, state and local), then see the results: your agreement with the final vote, how lawmakers actually voted in each chamber, friends, and stats.
2. **Filed or Fake:** 8 bill captions. Decide whether each was really filed or made up. Every made-up one is clearly marked FAKE after answering.
3. **Landslide:** drag 4 bills into order by vote margin. 3 points for an exact spot, 1 for one off.

## 2. The design is already done: match it

Read these before writing any UI:

- `design/Docket-app-design.pdf`: all 16 screens with captions. Start here.
- `design/screens/*.dc.html`: one file per screen at 390 px wide. Exact copy, colors, sizes and spacing are in the inline styles. To preview: `cd design/screens && python3 -m http.server 8765`, then open `http://localhost:8765/<Screen>.dc.html` in your browser tool.
- `design/README.md`: the screen list.
- The editable canvas: https://claude.ai/artifact/RA4mGYQamPJ927shwsgSiD. You can read it with the Artifact tool, but **don't edit it** unless the user asks.

**Design tokens.** Replace the current `src/theme` values with these.

| Token | Value | Use |
|---|---|---|
| ground | `#FFFFFF` | Screen background (light only for the hackathon; the design has no dark mode) |
| ink | `#000000` | Text, outlines, primary buttons |
| secondary text | `#3A3A3C` / `#5A5A5E` | Body / meta |
| hairline | `#E4E4E7`, light outline `#D4D4D8` | Dividers, inactive outlines |
| muted fill | `#F4F4F5` | Neutral boxes |
| lavender (purple) | `#C9D0F5` | Roll Call, state bills, **"disagreed"** |
| yellow | `#F8D08A` | Filed or Fake, Congress bills, small highlights only (e.g. your own leaderboard row, the "You both share votes" badge) |
| teal (green) | `#A8DDD5` | Landslide, local items, **"agreed"** |
| fake-stamp ink | `#2A3A9E` | The FAKE stamp only |
| vetoed-stamp red | `#C62828` | The VETOED stamp on sign-in only |

**Type:**
- Newsreader (`@expo-google-fonts/newsreader`) at weights 500, 700 and 800 for titles and game names.
- The system font (SF Pro) for everything else.
- `tabular-nums` for all numbers.

**Shapes:**
- Primary buttons are black pills (`borderRadius: 999`).
- Secondary buttons are pills with a 1.5px black outline.
- Cards use a 12–14px radius and a 1.5–2px black border, with no soft shadows. The one exception is the lifted row in Landslide, which has a hard offset shadow.

**Signature pieces:**
- The game cards on Today have a dashed tear-off "ballot stub" with notches.
- Bill cards show the bill number chip, colored by level (state lavender, Congress yellow, local teal).
- Progress uses small square tiles.
- Each chamber's vote on the results screen is a line-and-dot slider: a grey track, a tick at 50%, a black dot at the Yea share, plus "% Yea" and the real count.

**Rules:**
- Teal means agreed and lavender means disagreed, **never** with an × (disagreeing is not wrong).
- Don't scatter yellow around; it was deliberately pulled back to small highlights.
- Use the Expo skills for native behavior: tab bar, sheets, haptics, safe areas.

## 3. Current repo (already working, don't break it)

**Stack:**
- Expo SDK 58 with Expo Router, TypeScript; routes live in `src/app`.
- Firebase Auth via the Firebase JS SDK.
- Sign-in is **Google and Apple only**.
- Bundle ID `com.ybai08.docket`, Apple team `K24TK2WT4M`.

**Files:**
- `src/app/_layout.tsx`: the `Stack` with `Stack.Protected` guards (sign-in when signed out, the app when signed in).
- `src/app/sign-in.tsx`: an Apple button, a Google button and a bill card with a VETOED stamp. It still uses the older theme, so restyle it to `design/screens/SignIn.dc.html`.
- `src/app/index.tsx`: the old profile screen, which gets replaced.
- `src/lib/auth-context.tsx`: auth state, `signInWithGoogle` and `signInWithApple`, plus error messages.
- `src/lib/social-auth(.native).ts`:
  - Native Google Sign-In (`@react-native-google-signin/google-signin`), using `webClientId` and `iosClientId` from `.env`.
  - Apple via `expo-apple-authentication` with a SHA-256 nonce.
  - Web uses Firebase popups.
- `src/lib/firebase(.native).ts`: Auth with AsyncStorage persistence on native.
- `app.config.ts`: derives the Google URL scheme from `EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID`.

**`.env`** is gitignored. It holds the `EXPO_PUBLIC_FIREBASE_*` values and the two Google client IDs. Never print its values.

**Running the app.** It's a development build, not Expo Go, because of the native Google module.
- If `npm run ios` works, use it.
- On this Mac, `expo run:ios` wrongly treats the simulator as a physical device and fails with "No code signing certificates". When that happens:
  ```bash
  npx expo prebuild --platform ios --clean   # only when native config or native packages change
  xcodebuild -workspace ios/Docket.xcworkspace -scheme Docket -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 18 Pro' -derivedDataPath ios/build -allowProvisioningUpdates build
  xcrun simctl install booted ios/build/Build/Products/Debug-iphonesimulator/Docket.app
  npx expo start --dev-client --port 8081   # the build looks for Metro on 8081
  ```
- Rebuild natively only when you add a package with native code or change `app.json`, `app.config.ts`, or the Google IDs. Otherwise Metro reloads JS changes.
- Use the iOS Simulator tool to launch, tap and screenshot. Screenshots can lag a moment behind.

## 4. Product rules you must implement exactly

### Daily content
- One set per calendar day in Central time. New ballots arrive at midnight.
- Today shows three cards with a status: New, In progress (e.g. "3 of 5 votes"), or Done (with the result).
- A finished game reopens its results, not the game.

### Roll Call scoring
- **"Agreed with the final vote"** means your vote matches whether the legislative body passed it. The agreement count is out of 5.
- A governor's veto doesn't change what the legislators voted. Show it as the outcome line, e.g. "Vetoed by the governor".

### Results
In the order shown in `RollCallResults.dc.html`:
1. Headline and agree/disagree squares.
2. How lawmakers voted, per bill and per chamber.
3. Statistics: Played, Agreement %, Current streak, Max streak.
4. Agreement with friends today.
5. Review the 5 bills.
6. A countdown to the next Roll Call, and Share.

### Share text
Spoiler-free: no bills, no votes. For example:
```
Docket Oct 24
Roll Call 4/5 🟩🟪🟩🟩🟩
Filed or Fake 7/8
Landslide 9 pts
<link>
```
The colored squares are the only emoji in the app.

### Friends
- Two-way friendships only. There are no public profiles and no search by name.
- **Ways in:** an invite link (the inviter's token), a QR code, an exact @username (if allowed), contacts (hashed, and only when both people opt in), and members of a shared group.
- **Invite link flow:**
  1. The recipient plays today's ballot as a guest.
  2. They see "You and Alex agreed on 3 of 5".
  3. They're auto-added as friends, with Undo.
  4. They're asked to sign in to save the result.
- **QR code:** instant friends.
- **Username, contacts or group member:** sends a request, which is Accepted or Ignored. Ignoring is silent, and requests expire after 30 days.
- **Remove and block** are both silent. A block also stops future requests and hides each person's rank from the other in shared groups.

### Visibility tiers
- **Every friend sees:** streak, points, rank, and agreement % overall and by topic.
- **Per-bill votes** are visible only when **both** people have turned on "Share my vote on each bill" (globally or for that friend).

### Leak guards (non-negotiable)
- Overall agreement % shows only after **10 or more** shared bills.
- A topic's % shows only after **5 or more** shared bills on that topic.
- A daily "X of N" comparison shows only when X is neither 0 nor N; otherwise show "Play more days to compare".

### Groups
- Up to 50 members.
- Join by link, QR code or a 6-character code, with a preview screen first. An admin can require approval.
- **Inside a group:** a weekly leaderboard (resets Monday) and a per-bill Yea % split.
- A bill's split appears only after **5 or more included members** have voted.
- A unanimous result shows only with **10 or more voters**.
- Each member can turn off "Count me in group splits".
- A weekly recap is generated from group totals.

### Notifications (later slice)
- On by default: a friend passes you, a friend's streak is at risk, the weekly recap, and new requests.
- "A friend votes the opposite way" is off by default, and only possible when both share votes.

### Data handling
- The server never returns another user's raw votes except under the mutual-sharing rule.
- All agreement figures and splits are computed on the server.

## 5. Real data (don't invent facts)

Bills and outcomes are real. Names, scores and percentages for other users are sample data until real users exist. Anything not verified stays a `[placeholder]`.

**Verified Roll Call set (Oct 24 demo day):**

| # | Bill | Level | Plain-English title | Votes | Outcome |
|---|---|---|---|---|---|
| 1 | HB 1481 (TX, 89th Leg., 2025) | State | Ban personal phones in public school classrooms | TX House 128–17, TX Senate 31–0 | Signed into law |
| 2 | S. 146 TAKE IT DOWN Act (2025) | Congress | Make sites remove nonconsensual intimate images, including deepfakes | U.S. House 409–2, U.S. Senate unanimous consent | Signed into law |
| 3 | SB 3 (TX, 2025) | State | Ban hemp-derived THC products in Texas | TX Senate 24–7, TX House 87–54 | Vetoed by the governor |
| 4 | S. 5 Laken Riley Act (2025) | Congress | Detain undocumented immigrants charged with theft | U.S. Senate 64–35, U.S. House 263–156 | Signed into law |
| 5 | C14-2026-0020 (Austin, Aug 27 2026) | Local | Let shops and restaurants open at 37th and Speedway (rezone 3 lots from limited office to neighborhood commercial) | Austin City Council 10–1 | Approved |

**Other real Austin council items (Aug 27, 2026)**, for later days or local content:
- Removing the "Crosswalk on the Lake" street mural: 9–2.
- A 5-year Visit Austin tourism contract, about $20M for FY 2026–27: 10–1.

**Sources to fetch more content from:**
- **Austin council votes:** `https://datahub.austintexas.gov/resource/3c89-i35a.json`. A free Socrata API with per-member votes. Filter on `vote_cast='No'` to find contested items; most items pass unanimously.
- **Austin agenda items:** `https://webapi.legistar.com/v1/austintexas/matters`.
- **Texas bills:** Texas Legislature Online (`https://capitol.texas.gov/BillLookup/History.aspx?LegSess=89R&Bill=SB3`) and the OpenStates API (free key).
- **Congress:** Congress.gov API (free api.data.gov key). Recorded votes from the House Clerk XML (`https://clerk.house.gov/evs/2025/roll023.xml`) and senate.gov XML (`https://www.senate.gov/legislative/LIS/roll_call_lists/vote_menu_119_1.xml`).
- **ZIP or address to districts:** the U.S. Census Geocoder (free, no key): `https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress?address=...&benchmark=Public_AR_Current&vintage=Current_Current&layers=all&format=json`. It returns congressional and state legislative districts, county and place.

**Filed or Fake:**
- **Real captions** must be copied exactly from Texas Legislature Online or Congress.gov.
- **Fake captions** are written by us. Every one is labeled FAKE after the answer, and a fake caption is never shown out of context in a share.

**Landslide:**
- The design shows HB 2, HB 1481, SB 3 and SB 2 ranked by final House vote. Only HB 1481 (128–17) and SB 3 (87–54) are verified so far.
- **Fetch and verify HB 2 and SB 2's final Texas House votes** before seeding, or swap in bills whose tallies you've verified. Never guess.

**Lawmaker agreement on Profile:**
- Real per-member votes are needed: Congress from the House Clerk and Senate XML; Austin from the datahub API above.
- Texas member-level votes are harder to get. Keep them as `[placeholders]` unless you can get them reliably.

## 6. Architecture

- **App:** Expo (this repo). It talks to our API with a Firebase ID token (`Authorization: Bearer <idToken>`).
- **API:** `server/` in this repo, Node and TypeScript (Fastify or Express).
  - Verifies tokens with `firebase-admin`.
  - Holds every secret. No API keys ever ship in the app.
- **Database:** Postgres, intended to be Tiger Data (Timescale Cloud), which is a hackathon prize track. Develop against local Postgres (`docker run postgres:16`) or a free Tiger Cloud instance.
  - **Ask the user for the connection string. Never invent credentials.**
- **Hosting:** a Vultr VM (another prize track), plus a `.tech` domain (`docket.tech` is taken; check alternatives like `getdocket.tech`). Deployment comes in the last slice. Ask the user for Vultr access when you get there.

**Schema (adjust as needed):**
```sql
users(id text pk /* firebase uid */, username text unique, display_name text, zip text, state text, county text, city text,
      districts jsonb, share_votes bool default false, allow_username bool default true, match_contacts bool default false,
      created_at timestamptz)
bills(id text pk, level text check (level in ('federal','state','local')), jurisdiction text, number text, title text,
      summary text, chamber_votes jsonb /* [{chamber, yeas, nays, consent}] */, passed bool, outcome text, source_url text)
daily_sets(day date, game text, position int, bill_id text, payload jsonb, primary key (day, game, position))
votes(user_id text, bill_id text, day date, vote text check (vote in ('yea','nay')), created_at timestamptz,
      primary key (user_id, bill_id))
game_results(user_id text, day date, game text, score int, detail jsonb, primary key (user_id, day, game))
friendships(user_a text, user_b text, status text, source text, created_at timestamptz, primary key (user_a, user_b)) -- user_a < user_b
friend_requests(from_id text, to_id text, source text, created_at timestamptz, status text)
share_overrides(user_id text, friend_id text, share bool, primary key (user_id, friend_id))
invites(token text pk, inviter_id text, created_at timestamptz, revoked bool default false)
groups(id uuid pk, name text, admin_id text, code char(6) unique, approval_required bool default false, created_at timestamptz)
group_members(group_id uuid, user_id text, role text, include_in_splits bool default true, joined_at timestamptz,
      primary key (group_id, user_id))
blocks(blocker_id text, blocked_id text, primary key (blocker_id, blocked_id))
```

**Key queries (all thresholds enforced on the server):**
```sql
-- agreement between me and a friend
SELECT count(*) FILTER (WHERE a.vote = b.vote) AS agreed, count(*) AS shared
FROM votes a JOIN votes b ON a.bill_id = b.bill_id
WHERE a.user_id = $1 AND b.user_id = $2;   -- return a % only if shared >= 10

-- a group's split for today
SELECT v.bill_id, count(*) AS voters, avg((v.vote = 'yea')::int) AS yea_share
FROM votes v JOIN group_members m ON m.user_id = v.user_id
WHERE m.group_id = $1 AND m.include_in_splits AND v.day = $2
GROUP BY v.bill_id HAVING count(*) >= 5;   -- also hide a 0%/100% result unless voters >= 10
```

**Endpoints (first pass):**
- `GET /today`
- `POST /votes`
- `POST /results/:game`
- `GET /results/today`
- `GET /me`, `PATCH /me`
- `GET /friends`, `GET /friends/:id`
- `POST /invites`, `POST /invites/:token/accept`
- `POST /friend-requests`, `POST /friend-requests/:id/accept|ignore`
- `DELETE /friends/:id`, `POST /blocks`
- `GET /leaderboard?scope=friends|city|state|all&range=today|all`
- `POST /groups`, `POST /groups/join`, `GET /groups/:id`
- `PATCH /settings`

**Deep links:**
- `docket://invite/<token>` and `docket://group/<code>`. The `scheme` is already `docket`.
- Universal links can wait until there's a domain.

## 7. Slices

Each slice ends with a commit and push to `main`, with a message like `Slice N: <what>`. The commit body ends with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

**Done when** for every slice: `npx tsc --noEmit` passes, and the app runs in the simulator. You compare screenshots against the matching `design/screens/*.dc.html` and fix differences in copy, spacing and color.

Slices 0–3 are the must-have demo. Slice 6 is the Meta-track story.

### Slice 0: Foundation and look (about 1 h)
- **Fonts and tokens:** add Newsreader with `npx expo install @expo-google-fonts/newsreader expo-font`. Rewrite `src/theme` to the tokens in section 2.
- **Shared components:** `PillButton` (primary, outline), `BillChip` (by level), `BillCard`, `BallotStubCard`, `ProgressTiles`, `Stamp`, `VoteSlider` (the line-and-dot), `SegmentedPills`, `ScreenHeader`.
- **Tabs:** switch the signed-in area to tabs (Today / Friends / Profile) with Expo Router. Use NativeTabs if available, per the `expo-router` skill.
- **Sign-in:** restyle `sign-in.tsx` to `SignIn.dc.html`. Keep the auth logic exactly as is.
- **Done when:** you can sign in, land on an empty Today tab, and switch tabs.

### Slice 1: Content model and Today (about 1 h)
- `src/data/` typed seed content for Oct 24 (the 5 Roll Call bills above, the Filed or Fake set, the Landslide set), plus a `useToday()` hook. It reads local JSON for now and the API in Slice 3.
- Build Today exactly per `Main.dc.html`: header with streak and "1 of 3 cast", three ballot-stub cards with live status, and the leaderboard teaser row (static until Slice 6).
- **Done when:** Today matches the design and each card opens its game route.

### Slice 2: Roll Call and results (about 2 h)
- **Voting** (`RollCall.dc.html`):
  - A stacked card deck with swipe gestures (`react-native-gesture-handler` and `react-native-reanimated`, per the `expo-animation` skill).
  - Yea and Nay buttons, a light haptic on each vote, and progress tiles.
  - A "Your votes are in" screen at the end.
- **Results** (`RollCallResults.dc.html`):
  - Squares, then "How lawmakers voted" with `VoteSlider`, the real counts, outcome lines and Agreed/Disagreed tags.
  - Stats, a placeholder for friends' agreement, the countdown, and Share (the system share sheet with the text format above).
- Store progress locally (AsyncStorage) so the app survives restarts.
- **Done when:** a full play-through works, the numbers match the table in section 5, and Share produces the spoiler-free text.

### Slice 3: Backend v1 (about 2 h)
- `server/` with Fastify, `firebase-admin` token checks, Postgres migrations, and a seed script for the bills and the daily set.
- Endpoints: `/today`, `/votes`, `/results`, `/me`. Streaks and stats are computed on the server.
- The app switches `useToday()` and the results screen to the API, with loading, error and empty states.
- Add a `README` section on running the server locally.
- **Ask the user** for a Tiger Data connection string, or use local Postgres.
- **Done when:** votes and results persist on the server, and two simulator accounts each see their own state.

### Slice 4: Filed or Fake and Landslide (about 1.5 h)
- **Filed or Fake** per `FiledOrFake.dc.html`:
  - 8 captions with the real ones verified.
  - The stamp animation on answer, the "Good eye." / explanation copy, and the progress tiles.
- **Landslide** per `Landslide.dc.html`:
  - Long-press and drag to reorder, with a haptic when you pick up a row.
  - "Lock in ranking", the scoring (3 / 1), then a reveal screen with the real margins. Design the reveal in the same style.
- Both games post their results to the API and update Today's statuses.
- **Done when:** all three games can be played, scored and saved, and Today shows "1 of 3 cast" correctly as you go.

### Slice 5: Onboarding and Profile (about 1.5 h)
- **Onboarding** per the three `Onboard*.dc.html` screens:
  1. Look up the ZIP code through the server with the Census Geocoder, and save state, county, city and districts.
  2. Pick at least 3 issues; the Continue button stays disabled until then.
  3. Friends and reminders: the switches save to settings.
- New users go to onboarding after first sign-in. Returning users go straight to Today.
- **Profile** per `Profile.dc.html`:
  - Real stats and streak week, plus by-game stats.
  - "Issues you care about" sliders computed from votes by topic.
  - "Lawmakers you agree with" (Texas / Congress / Local): real data for Congress and Austin if fetched, `[placeholders]` otherwise.
  - Settings and sign out.
- **Done when:** a new account runs onboarding, and Profile shows real numbers.

### Slice 6: Friends, invites and privacy (about 2.5 h)
- **Friends tab** per `Friends.dc.html`:
  - Leaderboard (friends, plus Austin / Texas / everyone averages).
  - Friends list with agreement % and requests.
  - Groups list. The Groups section links into Slice 7; show an empty state until then.
- **Invites** per `Invite.dc.html` and `InviteLanding.dc.html`:
  - A personal invite link and QR code (`react-native-qrcode-svg`).
  - Handle `docket://invite/<token>`: guest play, then the agreement summary, then automatic friending with Undo, then sign-in to save.
  - Add by username.
- **Friend profile** per `FriendProfile.dc.html`, with the mutual-sharing rule and every leak guard from section 4.
- **Privacy** per `Privacy.dc.html`: every switch is wired to the server. Add a "Count me in group splits" switch and a per-friend sharing override in the friend's ⋯ menu.
- **Done when:** two accounts can connect through a link, see agreement only once the thresholds are met, and see per-bill votes only when both share.

### Slice 7: Groups (about 1.5 h)
- **Create a group** (name, approval switch) and a **join preview** for links, QR codes and the 6-character code. Design both screens in the same style.
- **Group page** per `Group.dc.html`: the weekly leaderboard, splits with the 5-voter minimum and the unanimity rule, and the weekly recap.
- **Admin actions:** rename, remove a member, reset the code.
- **Done when:** a group of test accounts shows splits only after 5 votes.

### Slice 8: Polish, deploy and demo (remaining time)
- **Polish:** loading, error and empty states everywhere; haptics; the stamp and card animations, with Reduce Motion respected; accessibility labels.
- **Deploy:** the server to Vultr with HTTPS and the `.tech` domain if the user provides them. Point the app's API URL at it.
- **Demo data:** a seed script that creates demo friends and a demo group, so the leaderboard and splits look alive. They must be labeled as demo accounts.
- **Demo video:** record the main path: sign in → Today → Roll Call → results with lawmaker votes → Share → invite a friend → friend profile → group.
- **Stretch:** notifications (`expo-notifications`); real lawmaker agreement for Congress; SerpApi news on each bill (server-side key).

## 8. How to work

**Before UI work**, load the installed skills:
- `expo:expo-overview` first.
- Then `expo:expo-design-system`, `expo:expo-native-ui`, `expo:expo-animation`, `expo:expo-router`, and `expo:expo-ui` where relevant.
- Also `frontend-design:frontend-design`.

**Rules:**
- **Use exact copy from the design files** unless the user changes it.
- **Install packages with `npx expo install <pkg>`.**
- **Run `npx tsc --noEmit` before every commit.**
- **Ask the user, and never make these up:**
  - credentials and API keys (Tiger Data, Vultr, Congress.gov, OpenStates, SerpApi)
  - legal or factual claims about bills
  - the domain name
- **Keep the user informed** with short progress notes. If a slice runs long, finish a demoable part first, commit it, and say what's left.
- **Pushing to `main` after each finished slice is fine.**
- **Ask before changing auth, bundle IDs or signing.**

**Start now:**
1. Read `design/README.md`, `design/Docket-app-design.pdf` (use `pdftotext` or open it in the browser tool; don't load the whole PDF into context), and `src/`.
2. Make your task list from section 7.
3. Begin Slice 0.
