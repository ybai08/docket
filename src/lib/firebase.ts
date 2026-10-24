// Web: Firebase Auth persists to IndexedDB by default.
import { connectAuthEmulator, getAuth, type Auth } from 'firebase/auth';

import { authEmulatorUrl, getFirebaseApp, isFirebaseConfigured } from './firebaseConfig';

export const auth: Auth | null = isFirebaseConfigured ? getAuth(getFirebaseApp()) : null;

if (auth && authEmulatorUrl) connectAuthEmulator(auth, authEmulatorUrl, { disableWarnings: true });
