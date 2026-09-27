// Firebase client for the people layer (docs/GOVERNANCE.md, PLAN.md phase 0b).
// The public directory never touches this module — it stays a static site.
// Only the join, people and steward pages import it, so a visitor who never
// signs in never loads the SDK.

import { initializeApp } from 'firebase/app';
import { getAuth, connectAuthEmulator } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

// Web app config is not a secret; it identifies the project, and the rules do
// the protecting. Registered 2026-09-23 with `firebase apps:create WEB`.
const host = window.location.hostname.toLowerCase();
const onNetworkDomain = host === 'makerspace.network' || host.endsWith('.makerspace.network');

export const firebaseApp = initializeApp({
  apiKey: 'AIzaSyCptyEG-GEdpwk9oChq_Q4c8osrE_aMQQ0',
  // On our own domains Firebase Hosting serves the /__/auth/ handler, so the
  // sign-in popup stays first-party and survives third-party-cookie blocking.
  // Requires makerspace.network in Authentication → Authorized domains.
  authDomain: onNetworkDomain ? 'makerspace.network' : 'makerspace-net.firebaseapp.com',
  projectId: 'makerspace-net',
  storageBucket: 'makerspace-net.firebasestorage.app',
  messagingSenderId: '20071865108',
  appId: '1:20071865108:web:1f5908bb9c350bf3670001',
});

export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);

if (import.meta.env.VITE_USE_EMULATORS === '1') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9199', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8180);
}
