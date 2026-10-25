# Docket demo video: script and storyboard

- **Runtime:** 2:04 (124 seconds)
- **Format:** 1920x1080, 30 fps
- **Music:** a light, quiet loop (about −24 LUFS) composed from scratch by `scripts/music.mjs`, so it's royalty-free with no third-party audio. `out/docket-demo-no-music.mp4` is the same cut without it, if you'd rather add your own.
- **Facecam:** the bottom-right corner stays clear for the whole video: 28% of the width by 30% of the height (x ≥ 1382, y ≥ 756). Put your camera rectangle there.

## What standout hackathon demos do, and how this video uses it

- **Hook in the first 3–5 seconds.** Judges often decide in about five seconds, so open with the outcome or a sharp question, not the tech stack ([ElevenLabs hackathon guide](https://hacks.elevenlabs.io/guide)). Here, two lines of kinetic type ask whether you know how your lawmakers voted, then the logo lands.
- **Problem in one line, then straight to the product.** Keep the setup short and give the demo about half the runtime ([AngelHack](https://angelhack.com/blog/10-tips-to-help-you-rock-your-next-hackathon-demo/), [Reskilll](https://blogs.reskilll.com/hackathon-demo-presentation-tips-pitch-3-minutes-win-2026/)). The problem gets 7 seconds; the app is on screen from 0:07 to 1:48.
- **Show real functionality, not slides.** Judges weigh the working project over production polish ([AI Tinkerers video guide](https://amsterdam.aitinkerers.org/docs/public/video_production_guide.md)). Every phone screen is a real screenshot from the app running on the test account.
- **One idea per scene, short punchy type.** Each scene has a small chapter label, one serif headline and one supporting line, in the app's own colors.
- **Close crisply, no trailing "any questions?"** ([Reskilll](https://blogs.reskilll.com/hackathon-demo-presentation-tips-pitch-3-minutes-win-2026/)). The end card has the name, one line and the URL.

## Scenes

Product scenes use three columns: the headline on the left, the phone in the middle, and a stat card in the upper right. Each stat card repeats one real number from the screen being shown, for example "4 of 5" or "147–0". The times are when each scene is fully on screen. Transitions overlap by about half a second. The voiceover lines are suggestions; say them in your own words.

| # | Time | On screen | Suggested voiceover |
|---|------|-----------|---------------------|
| 1 | 0:00–0:07 | White screen. Kinetic serif type: "Every week, lawmakers vote on bills that shape your life." then "Do you know how yours voted?" The Docket wordmark lands with three ballot tiles filling in. | "Every week, lawmakers vote on bills that shape your life. Most of us never find out how ours voted. So we built Docket." |
| 2 | 0:07–0:15 | Phone: the Today screen. Left: "A ballot a day. Three quick games, all built on real bills." | "Docket gives you a daily ballot: three quick games, all built on real bills. Play every day to keep your streak." |
| 3 | 0:15–0:29 | **Roll Call.** Phone: a real bill card (SB 6, large power users). A tap lands on Yea and a teal YEA stamp drops. The phone then switches to Roll Call history: "4/5, you agreed with the result." | "In Roll Call you vote Yea or Nay on five real bills, from Congress, your state and your city. Then you see whether you matched the final vote, and how each chamber voted." |
| 4 | 0:29–0:41 | **Filed or Fake.** Two big bill descriptions stamp in turn: "Ban modifying or controlling the weather…" FILED · HB 1382, then "Name the armadillo the official state lawn ornament." FAKE. Then the phone shows the results: "You spotted 4 of 8." | "Filed or Fake: eight bills, written in plain English. Some were really filed by lawmakers. Some we made up. Can you tell which?" |
| 5 | 0:41–0:52 | **Landslide.** An animated rebuild of the Landslide screen: your ranking reshuffles into the real order, and each bill shows its final vote and margin (147–0, 111–29, 96–41, 74–65). | "Landslide: rank four bills by how big they won. Three points for the exact spot, one if you're one off." |
| 6 | 0:52–1:08 | **Friends.** Phone: the Leaderboard race bars, then the Friends list. A tap opens Priya's page: "50%, how often you vote the same", then the You / Priya table split into Voted the same and Voted differently. Headline changes to "See where you agree." | "Race your friends on the daily leaderboard. Tap a friend to see how often you two vote the same, and when you both share, exactly where you agree and where you split, bill by bill." |
| 7 | 1:08–1:17 | **Beyond your friends**, headline "See your whole state." Phone: the Texas breakdown (players, score spread, per-game averages), then "How Texas voted" with Yea/Nay bars. | "Zoom out to your city, your state, or everyone on Docket: how people scored, and how they voted on today's bills." |
| 8 | 1:17–1:29 | **Profile.** Phone: the voter card with streak and By game, then "Lawmakers you agree with" with real photos and agreement bars. | "Your profile is your voter card: your streak, your history in every game, and the lawmakers you actually agree with." |
| 9 | 1:29–1:40 | **Bills and lawmakers.** Phone: the HB 1481 bill page (outcome, chamber votes, your lawmakers' votes), then Lloyd Doggett's page (background with its Wikipedia credit, agreement, how he voted). | "Tap any bill for the full record, including how your own lawmakers voted. Tap any lawmaker for who they are and how they voted." |
| 10 | 1:40–1:48 | **Nationwide.** Kinetic type: "Any U.S. ZIP code." A counter rolls to 7,967 lawmakers. "Congress and every state legislature, in all 50 states and D.C." | "Enter any U.S. ZIP code and Docket finds your members of Congress and your state legislators, in all 50 states and D.C." |
| 11 | 1:48–1:56 | **Privacy.** Three rules appear one by one beside the group page. | "And it's private by design. Party stays hidden until you've voted. Group results stay hidden until at least five people vote. Your votes are shared only if you both opt in." |
| 12 | 1:56–2:04 | **End card.** The Docket wordmark, "Play today's ballot.", docketapp.tech | "Docket. Play today's ballot." |

## What every claim rests on

- **Three daily games:** the Today screen and the three game screens.
- **Five bills in Roll Call, eight in Filed or Fake, four in Landslide:** the app's own copy ("Bill 1 of 5", "Eight bills. Some were made up.", "Rank four bills").
- **Landslide scoring:** 3 points for an exact spot, 1 for one off (the app's own copy and `src/lib/rules.ts`).
- **Vote sharing:** a friend's bill-by-bill votes appear only when you both share (`src/app/friend/[id].tsx`).
- **Group privacy:** splits are hidden below 5 voters, or 10 if everyone voted alike. The area breakdown also needs 5 players.
- **Party:** hidden on bill cards and shown on Profile only after you've voted on one of that lawmaker's bills.
- **7,967 lawmakers:** Congress plus every state legislature, as reported by the backend's nationwide build. Background text comes from Wikipedia (CC BY-SA 4.0) and is credited on screen.
- **What the video doesn't claim:** that daily bills exist for every state. Today's bills cover Congress, Texas and Austin. Only lawmaker data is nationwide.

## Re-rendering

```bash
cd promo
npm install
npm run render
```

- **Without music:** `npm run render:silent` writes `out/docket-demo-no-music.mp4`.
- **Changing the music:** after editing `scripts/music.mjs`, `npm run music` rebuilds `public/music.mp3` (tempo, chords and parts are at the top of the file).

- **Output:** `promo/out/docket-demo.mp4`.
- **Preview and scrub:** `npm run studio` opens Remotion Studio.
- **Editing:** scene timing is in `src/timeline.ts` and the scene components are in `src/`. Screenshots live in `public/footage/`, so swap one by replacing its JPG with a new simulator screenshot (804 px wide).
- **Checking the facecam area:** `npm run render:safe` renders a copy with the bottom-right area outlined.
