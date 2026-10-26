# App Store submission checklist

Everything App Store Connect asks for before Docket 1.0.0 can go to App Review. The app record is `6826853964` (bundle id `com.ybai08.docket`): https://appstoreconnect.apple.com/apps/6826853964

The build comes from EAS (`eas build -p ios --profile production --auto-submit`). It uploads to App Store Connect on its own; the steps below are the parts only the account holder can fill in.

## 1. App Information

- **Category:** Primary *Education*, secondary *News*.
- **Content rights:** "Yes, it contains third-party content, and I have the rights to use it." Bill text and votes are public government records. Lawmaker photos are the official ones published by Congress and the state legislatures. Lawmaker summaries are Wikipedia openings under CC BY-SA, so keep their attribution in the app.
- **Age rating:** see section 4.
- **License Agreement (EULA):** keep Apple's standard EULA. To use Docket's own terms instead, choose *Custom* under **App Information > License Agreement** and paste the text of https://docketapp.tech/terms/ (the field takes text, not a link). Either way, the in-app terms notice links to it.

## 2. Pricing and Availability

- Price: **Free**.
- Availability: **United States** only. The bills, lawmakers and ZIP codes are all U.S. data.

## 3. App Privacy

- **Privacy Policy URL:** https://docketapp.tech/privacy/
- **Data collection:** "Yes, we collect data from this app."

Declare these data types. For each one, answer: used for **App Functionality** only, **linked to the user's identity**, and **not used for tracking**.

| App Store Connect category | Data type | What Docket stores |
| --- | --- | --- |
| Contact Info | Name | Display name from Apple or Google sign-in |
| Contact Info | Email Address | Sign-in email (or Apple's relay address) |
| Location | Coarse Location | ZIP code, to find the player's districts and lawmakers |
| Sensitive Info | Sensitive Info | Votes on bills, which can reveal political opinions |
| User Content | Other User Content | Username, group names, friend requests |
| Identifiers | User ID | Firebase account ID |

Docket has no ads, analytics SDK or third-party tracking, so the answer to "Do you or your third-party partners use data for tracking?" is **No**. No App Tracking Transparency prompt is needed.

## 4. Age Rating questionnaire

| Question | Answer |
| --- | --- |
| Parental controls | No |
| Age assurance | No |
| Unrestricted web access | No (bill sources open in Safari, outside the app) |
| User-generated content | Yes (usernames, group names, friends' votes) |
| Messaging and chat | No |
| Advertising | No |
| Profanity or crude humor | None |
| Horror or fear themes | None |
| Alcohol, tobacco or drug use or references | Infrequent/Mild (some bill titles name THC, alcohol or tobacco) |
| Mature or suggestive themes | None |
| Medical or treatment information | None |
| Health or wellness topics | None |
| Sexual content or nudity | None |
| Cartoon or fantasy violence | None |
| Realistic violence | None |
| Guns or other weapons | None |
| Gambling | No |
| Simulated gambling | None |
| Contests | No |
| Loot boxes | No |

App Store Connect computes the rating from these answers. Expect 13+, mainly because of user-generated content.

## 5. Version 1.0.0 page

- **Screenshots:** 6.9" iPhone display, **1320 x 2868** portrait, 3 to 10 images. Apple scales them down for smaller iPhones. iPad screenshots aren't needed, because `supportsTablet` is off. Capture them from the iPhone 18 Pro Max simulator (1320 x 2868) with the production build installed:

  ```bash
  xcrun simctl io "iPhone 18 Pro Max" screenshot docket-1.png
  ```

  Suggested set: Today, a Roll Call vote, Filed or Fake, Landslide results, Friends, a lawmaker page.
- **Promotional text:** "New ballots every day on real bills from Congress, your state and your city."
- **Description:** start from the one below. Its last line must stay.

  > Docket turns real legislation into quick daily games. Each day you get new bills from Congress, your state legislature and, in Austin, the city council, matched to your ZIP code.
  >
  > Roll Call: vote yes or no on recent real bills, then see how your representatives and friends voted.
  > Filed or Fake: some of the bills are made up. Spot which ones were actually filed.
  > Landslide: rank bills by how big a margin they passed with.
  >
  > Keep a daily streak, compare results with friends, and look up the lawmakers who represent you. Every bill links to its official source.
  >
  > Docket is not affiliated with any government.

- **Keywords:** `congress,legislature,bills,vote,civics,politics,government,lawmakers,daily,game`
- **Support URL:** https://docketapp.tech/support/
- **Marketing URL** (optional): https://docketapp.tech
- **Copyright:** `2026 Yang Bai`

## 6. App Review Information

- **Sign-in required:** uncheck it, and explain in the notes instead. Docket has no username/password accounts.
- **Notes:**

  > Docket has no username and password accounts. Tap "Sign in with Apple" on the first screen and use any Apple ID; a new account is created automatically. When asked for a ZIP code, enter 78705 (Austin, Texas) to see Congress, Texas Legislature and Austin City Council bills.
  >
  > Bill information comes from public government records, and every bill page links to its official source ("Read the bill"). Docket is not affiliated with any government.
  >
  > Players can report any user or group in the app with the Report button, and can block anyone. Usernames and group names are filtered for abuse. Reports are reviewed within 24 hours using a moderation tool, and offending content and accounts are removed.
  >
  > To delete an account: Profile tab > the Privacy row > "Delete my account and all my votes".

- **Contact:** your name, phone and email.

## 7. Build and submit

1. In the version page's **Build** section, pick the newest build. Export compliance is already answered in the build (`usesNonExemptEncryption: false`).
2. **Version release:** choose *Manually release this version*, so it goes live only when you press the button.
3. Click **Add for Review**, then **Submit to App Review**.

Review usually takes one to two days. The answer arrives by email and in App Store Connect.
