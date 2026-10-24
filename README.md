# Docket

Swipe through real Texas and Austin bills, play quick daily games, and see how your friends voted. Built at HackTX 2026.

Stack: Expo (React Native, Expo Router) + Firebase Auth.

## Run it

```bash
npm install
cp .env.example .env   # then paste your Firebase web config
npx expo start          # press w for web, or scan the QR code with Expo Go
```

In the Firebase console, enable **Authentication > Sign-in method > Email/Password**.

### Without a Firebase project

Run auth against a local emulator:

```bash
npm run emulator
```

Then set these in `.env`:

```
EXPO_PUBLIC_FIREBASE_API_KEY=demo-key
EXPO_PUBLIC_FIREBASE_PROJECT_ID=demo-docket
EXPO_PUBLIC_FIREBASE_AUTH_EMULATOR=http://127.0.0.1:9099
```

On a physical phone, replace `127.0.0.1` with your laptop's LAN IP.

## Layout

- `src/app/` — screens (Expo Router). `sign-in.tsx` and `index.tsx` (profile) are guarded in `_layout.tsx`.
- `src/lib/auth-context.tsx` — auth state, sign in/up/out, error messages.
- `src/lib/firebase.ts` / `firebase.native.ts` — Firebase Auth setup for web and iOS/Android.
