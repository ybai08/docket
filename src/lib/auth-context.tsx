import { deleteUser, onAuthStateChanged, signOut as firebaseSignOut, type Auth, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { auth } from './firebase';
import {
  reauthenticate,
  SignInCancelled,
  signInWithApple as appleSignIn,
  signInWithGoogle as googleSignIn,
  signOutOfProviders,
} from './social-auth';

type AuthState = {
  user: User | null;
  initializing: boolean;
  signInWithGoogle: () => Promise<void>;
  signInWithApple: () => Promise<void>;
  signOut: () => Promise<void>;
  /** Deletes the account everywhere: revokes Sign in with Apple, runs deleteData, deletes the Firebase user, signs out. */
  deleteAccount: (deleteData: () => Promise<void>) => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function requireAuth() {
  if (!auth) throw new Error('Firebase is not configured. Fill in .env first.');
  return auth;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [initializing, setInitializing] = useState(Boolean(auth));
  // updateProfile() (Apple's first sign-in) does not fire onAuthStateChanged, so bump this to re-render.
  const [, setProfileVersion] = useState(0);

  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      setInitializing(false);
    });
  }, []);

  const value: AuthState = {
    user,
    initializing,
    signInWithGoogle: async () => {
      await googleSignIn(requireAuth());
    },
    signInWithApple: async () => {
      await appleSignIn(requireAuth());
      setProfileVersion((v) => v + 1);
    },
    signOut: async () => {
      await signOutOfProviders();
      await firebaseSignOut(requireAuth());
    },
    deleteAccount: async (deleteData) => {
      const a = requireAuth();
      const current = a.currentUser;
      if (!current) throw new Error('Sign in first.');
      // A fresh sign-in gives Apple's code to revoke and makes the login recent enough for deleteUser.
      const { appleAuthorizationCode } = await reauthenticate(current);
      // A failed revoke must not block deletion (it fails until the Firebase Apple provider has its key set up).
      if (appleAuthorizationCode) await revokeAppleCode(a, appleAuthorizationCode).catch((err) => console.warn(err));
      await deleteData();
      try {
        await deleteUser(current);
      } catch (err) {
        if ((err as { code?: string }).code !== 'auth/requires-recent-login') throw err;
        await reauthenticate(current);
        await deleteUser(current);
      }
      await signOutOfProviders();
      await firebaseSignOut(a).catch(() => {});
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Revokes the user's Sign in with Apple grant (App Store guideline 5.1.1(v)). Firebase's revokeAccessToken
 * sends the token as an access token, but expo-apple-authentication gives an authorization code, so this
 * calls the same Identity Toolkit endpoint with tokenType CODE, as Firebase's iOS SDK does.
 */
async function revokeAppleCode(a: Auth, code: string) {
  const idToken = await a.currentUser?.getIdToken();
  const res = await fetch(`https://identitytoolkit.googleapis.com/v2/accounts:revokeToken?key=${a.app.options.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId: 'apple.com', tokenType: 'CODE', token: code, idToken }),
  }).catch(() => null);
  if (!res?.ok) throw new Error(`Sign in with Apple revoke failed (${res ? `${res.status} ${await res.text().catch(() => '')}` : 'network'})`);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

const CANCEL_CODES = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request', 'SIGN_IN_CANCELLED', '-5']);

/** True when the person closed the Google/Apple sheet; show nothing. */
export function isCancelled(err: unknown) {
  const code = (err as { code?: string })?.code;
  return err instanceof SignInCancelled || (code !== undefined && CANCEL_CODES.has(String(code)));
}

const AUTH_ERRORS: Record<string, string> = {
  'auth/account-exists-with-different-credential':
    'That email already signed in with the other provider. Use that button instead.',
  'auth/operation-not-allowed': 'This sign-in method is not enabled in the Firebase console.',
  'auth/invalid-credential': 'Sign-in failed. Check the Firebase and Google/Apple setup.',
  'auth/popup-blocked': 'Your browser blocked the sign-in popup. Allow popups and try again.',
  'auth/unauthorized-domain': 'This domain is not authorized in the Firebase console.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  IN_PROGRESS: 'Sign-in is already in progress.',
  ERR_REQUEST_UNKNOWN: 'Apple sign-in did not finish. Make sure this device is signed in to an Apple Account in Settings.',
  ERR_REQUEST_FAILED: 'Apple sign-in failed. Try again in a moment.',
};

export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code && AUTH_ERRORS[code]) return AUTH_ERRORS[code];
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}
