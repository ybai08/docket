// iOS/Android: persist the session in AsyncStorage so users stay signed in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from 'firebase/auth';

import { authEmulatorUrl, getFirebaseApp, isFirebaseConfigured } from './firebaseConfig';

// Firebase's react-native build exports getReactNativePersistence, but its
// published types (picked before the react-native condition) leave it out.
const { connectAuthEmulator, getAuth, getReactNativePersistence, initializeAuth } = FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence: (storage: typeof AsyncStorage) => FirebaseAuth.Persistence;
};

function createAuth() {
  const app = getFirebaseApp();
  try {
    return initializeAuth(app, { persistence: getReactNativePersistence(AsyncStorage) });
  } catch {
    // Fast Refresh re-runs this module; Auth already exists for the app.
    return getAuth(app);
  }
}

export const auth: FirebaseAuth.Auth | null = isFirebaseConfigured ? createAuth() : null;
if (auth && authEmulatorUrl) connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
