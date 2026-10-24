// iOS/Android: native Google and Apple sheets, then hand the ID token to Firebase.
import { GoogleSignin, isSuccessResponse } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
  updateProfile,
  type Auth,
} from 'firebase/auth';
import { Platform } from 'react-native';

import { googleClientIds } from './firebaseConfig';

export const isGoogleConfigured = Boolean(googleClientIds.web && (Platform.OS !== 'ios' || googleClientIds.ios));

if (isGoogleConfigured) {
  // webClientId makes Google issue an ID token whose audience Firebase accepts.
  GoogleSignin.configure({ webClientId: googleClientIds.web, iosClientId: googleClientIds.ios });
}

export class SignInCancelled extends Error {}

export async function signInWithGoogle(auth: Auth) {
  if (!isGoogleConfigured) throw new Error('Google sign-in is not set up yet. Add the Google client IDs to .env.');
  await GoogleSignin.hasPlayServices();
  const response = await GoogleSignin.signIn();
  if (!isSuccessResponse(response)) throw new SignInCancelled();
  if (!response.data.idToken) throw new Error('Google did not return an ID token. Check the web client ID.');
  await signInWithCredential(auth, GoogleAuthProvider.credential(response.data.idToken));
}

export async function isAppleSignInAvailable() {
  return Platform.OS === 'ios' && (await AppleAuthentication.isAvailableAsync());
}

export async function signInWithApple(auth: Auth) {
  // Apple gets the hashed nonce; Firebase checks it against the raw one.
  const rawNonce = Crypto.randomUUID();
  const hashedNonce = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, rawNonce);

  let appleCredential: AppleAuthentication.AppleAuthenticationCredential;
  try {
    appleCredential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
  } catch (err) {
    if ((err as { code?: string }).code === 'ERR_REQUEST_CANCELED') throw new SignInCancelled();
    throw err;
  }
  if (!appleCredential.identityToken) throw new Error('Apple did not return an identity token.');

  const credential = new OAuthProvider('apple.com').credential({ idToken: appleCredential.identityToken, rawNonce });
  const { user } = await signInWithCredential(auth, credential);

  // Apple only shares the name on the very first sign-in, so save it then.
  const { givenName, familyName } = appleCredential.fullName ?? {};
  const name = [givenName, familyName].filter(Boolean).join(' ');
  if (name && !user.displayName) await updateProfile(user, { displayName: name });
}

export async function signOutOfProviders() {
  if (isGoogleConfigured) await GoogleSignin.signOut().catch(() => {});
}
