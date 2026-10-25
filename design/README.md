# Docket design

The source of truth for how the app should look. The editable original is the Claude Design canvas "Docket game screens" (https://claude.ai/artifact/RA4mGYQamPJ927shwsgSiD, private to the owner's account); these files are a snapshot of it.

- `Docket-app-design.pdf`: all 16 screens with captions, grouped by flow. Start here.
- `screens/*.dc.html`: one file per screen, 390 px wide (iPhone). Copy, colors, spacing and layout are all inline styles, so read them for exact values.
- `canvas.json`: the canvas layout (which screen is where, titles, sizes).
- `screens/support.js`: a small static renderer so the screens open in a browser. It is not the canvas runtime: interactive bits (tabs, toggles, voting) show their first state only.

Preview a screen locally:

```bash
cd design/screens && python3 -m http.server 8765
# then open http://localhost:8765/Main.dc.html
```

## Screens

| Flow | File | What it shows |
|---|---|---|
| Daily ballots | `Main.dc.html` | Today tab: "Today's ballots", three game cards with tear-off stubs, leaderboard teaser |
| | `RollCall.dc.html` | Roll Call voting: one bill card at a time, Yea/Nay |
| | `RollCallResults.dc.html` | Results: agree/disagree squares, how lawmakers voted (line-and-dot), stats, friends, share (full scroll) |
| | `FiledOrFake.dc.html` | Filed or Fake after answering a fake caption |
| | `Landslide.dc.html` | Landslide ranking, one row mid-drag |
| | `Profile.dc.html` | Profile (full scroll): stats, streak week, by game, issues, lawmakers (Texas / Congress / Local) |
| Sign in and onboarding | `SignIn.dc.html` | Apple and Google sign-in |
| | `OnboardLocation.dc.html` | ZIP code sets state, county, city |
| | `OnboardIssues.dc.html` | Pick at least 3 issues |
| | `OnboardFriends.dc.html` | Friends, invite link, reminder, vote sharing |
| Friends and groups | `Friends.dc.html` | Friends tab: Leaderboard / Friends / Groups |
| | `FriendProfile.dc.html` | Agreement with one friend, by topic, recent bills |
| | `Group.dc.html` | Group leaderboard, anonymous splits (5-vote minimum), recap |
| | `Invite.dc.html` | Invite sheet: result card, link, QR, contacts, username |
| | `InviteLanding.dc.html` | What an invited friend sees after playing |
| | `Privacy.dc.html` | Privacy and notification settings (full scroll) |
