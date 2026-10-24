// iOS/Android: persist the session in AsyncStorage so users stay signed in.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FirebaseAuth from 'firebase/auth';

import { authEmulatorUrl, getFirebaseApp, isFirebaseConfigured } from './firebaseConfig';

// Firebase's react-native build exports getReactNativePersistence, but its
// published types (picked before the react-native condition) leave it out.
const { connectAuthEmulator, getReactNativePersistence, initializeAuth } = FirebaseAuth as typeof FirebaseAuth & {
  getReactNativePersistence: (storage: typeof AsyncStorage) => FirebaseAuth.Persistence;
};

export const auth: FirebaseAuth.Auth | null = isFirebaseConfigured
  ? initializeAuth(getFirebaseApp(), { persistence: getReactNativePersistence(AsyncStorage) })
  : null;

if (auth && authEmulatorUrl) connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
