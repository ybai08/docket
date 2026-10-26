// Web: Firebase's own popup flows.
import { GoogleAuthProvider, reauthenticateWithPopup, signInWithPopup, type Auth, type User } from 'firebase/auth';

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

/** Signs in again so Firebase treats the login as recent (deleteUser needs that). Apple is iOS-only. */
export async function reauthenticate(user: User): Promise<{ appleAuthorizationCode?: string }> {
  if (user.providerData[0]?.providerId === 'google.com') await reauthenticateWithPopup(user, new GoogleAuthProvider());
  return {};
}

export async function signOutOfProviders() {}
