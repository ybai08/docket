import { onAuthStateChanged, signOut as firebaseSignOut, type User } from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { auth } from './firebase';
import {
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
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
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
};

export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code && AUTH_ERRORS[code]) return AUTH_ERRORS[code];
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}
