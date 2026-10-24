# Docket

Swipe through real Texas and Austin bills, play quick daily games, and see how your friends voted. Built at HackTX 2026.

Stack: Expo (React Native, Expo Router) + Firebase Auth. Sign-in is Google (iOS, Android, web) and Apple (iOS only).

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

## Layout

- `src/app/` — screens (Expo Router). `sign-in.tsx` and `index.tsx` (profile) are guarded in `_layout.tsx`.
- `src/lib/auth-context.tsx` — auth state, sign-in/out, error messages.
- `src/lib/social-auth.native.ts` / `social-auth.ts` — Google and Apple sign-in for iOS/Android and web.
- `src/lib/firebase.native.ts` / `firebase.ts` — Firebase Auth setup for iOS/Android and web.
