"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import {
  connectFirestoreEmulator,
  getFirestore,
  type Firestore,
} from "firebase/firestore";
import {
  connectFunctionsEmulator,
  getFunctions,
  type Functions,
} from "firebase/functions";

/**
 * Browser-side Firebase. Everything here is lazy: nothing initialises at import
 * time, so this module is safe to pull into a Server Component's dependency
 * graph without trying to boot Firebase during SSR.
 */

const USE_EMULATOR =
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true";

/**
 * With the emulator these values are never validated, so any non-empty string
 * works. That is what lets the whole app run before a real project exists.
 */
const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "demo-api-key",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "localhost",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "demo-shorelines",
  storageBucket:
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "demo-shorelines",
  messagingSenderId:
    process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "000000000000",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "demo-app-id",
};

let emulatorsConnected = false;

function app(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(config);
}

/**
 * Connecting an emulator twice throws. Next's Fast Refresh re-runs modules
 * freely, so this guard is load-bearing in dev, not defensive clutter.
 */
function connectEmulatorsOnce(auth: Auth, db: Firestore, fns: Functions) {
  if (!USE_EMULATOR || emulatorsConnected) return;
  emulatorsConnected = true;

  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
}

export function getFirebase() {
  const instance = app();
  const auth = getAuth(instance);
  const db = getFirestore(instance);
  // Functions region must match the region the callables are deployed to.
  const functions = getFunctions(instance, "asia-south1");

  connectEmulatorsOnce(auth, db, functions);

  return { app: instance, auth, db, functions };
}

export { USE_EMULATOR };
