import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User,
} from 'firebase/auth';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

import { auth } from './firebase';

type AuthState = {
  user: User | null;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (name: string, email: string, password: string) => Promise<void>;
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
  // updateProfile() does not fire onAuthStateChanged, so bump this to re-render.
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
    signIn: async (email, password) => {
      await signInWithEmailAndPassword(requireAuth(), email.trim(), password);
    },
    signUp: async (name, email, password) => {
      const { user: created } = await createUserWithEmailAndPassword(requireAuth(), email.trim(), password);
      await updateProfile(created, { displayName: name.trim() });
      setProfileVersion((v) => v + 1);
    },
    signOut: async () => {
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

const AUTH_ERRORS: Record<string, string> = {
  'auth/invalid-email': 'That email address looks wrong.',
  'auth/invalid-credential': 'Wrong email or password.',
  'auth/user-not-found': 'Wrong email or password.',
  'auth/wrong-password': 'Wrong email or password.',
  'auth/email-already-in-use': 'An account with that email already exists. Sign in instead.',
  'auth/weak-password': 'Password needs at least 6 characters.',
  'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
  'auth/network-request-failed': 'No connection. Check your internet and try again.',
  'auth/operation-not-allowed': 'Email sign-in is not enabled in the Firebase console.',
  'auth/configuration-not-found': 'Email sign-in is not enabled in the Firebase console.',
};

export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code;
  if (code && AUTH_ERRORS[code]) return AUTH_ERRORS[code];
  return err instanceof Error ? err.message : 'Something went wrong. Try again.';
}
