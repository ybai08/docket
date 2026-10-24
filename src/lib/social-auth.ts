// Web: Firebase's own popup flows.
import { GoogleAuthProvider, signInWithPopup, type Auth } from 'firebase/auth';

export const isGoogleConfigured = true;

export class SignInCancelled extends Error {}

export async function signInWithGoogle(auth: Auth) {
  await signInWithPopup(auth, new GoogleAuthProvider());
}

// Apple on the web needs a Services ID and domain verification; iOS-only for now.
export async function isAppleSignInAvailable() {
  return false;
}

export async function signInWithApple(_auth: Auth) {
  throw new Error('Sign in with Apple is only available on iOS.');
}

export async function signOutOfProviders() {}
