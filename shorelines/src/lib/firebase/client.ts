"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { initializeAppCheck, ReCaptchaV3Provider } from "firebase/app-check";
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
import {
  connectStorageEmulator,
  getStorage,
  type FirebaseStorage,
} from "firebase/storage";

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
function connectEmulatorsOnce(
  auth: Auth,
  db: Firestore,
  fns: Functions,
  storage: FirebaseStorage
) {
  if (!USE_EMULATOR || emulatorsConnected) return;
  emulatorsConnected = true;

  connectAuthEmulator(auth, "http://127.0.0.1:9099", {
    disableWarnings: true,
  });
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  connectFunctionsEmulator(fns, "127.0.0.1", 5001);
  connectStorageEmulator(storage, "127.0.0.1", 9199);
}

let appCheckInitialized = false;

/**
 * Skipped under the emulator: there's no App Check emulator wired up (see
 * firebase.json), the callables don't enforce it there either (see
 * ENFORCE_APP_CHECK in functions/src/index.ts), and calling out to a real
 * reCAPTCHA endpoint would break the "fully offline" emulator workflow.
 *
 * Skipped for real, too, until NEXT_PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY is
 * set — that means a reCAPTCHA v3 site key registered against this Firebase
 * project's App Check config in the console, a manual step this can't do.
 * Same double-init guard as connectEmulatorsOnce: Fast Refresh re-runs this
 * module, and initializeAppCheck throws if called twice on one app.
 */
function initAppCheckOnce(instance: FirebaseApp) {
  if (USE_EMULATOR || appCheckInitialized) return;
  const siteKey = process.env.NEXT_PUBLIC_FIREBASE_RECAPTCHA_SITE_KEY;
  if (!siteKey) return;
  appCheckInitialized = true;

  initializeAppCheck(instance, {
    provider: new ReCaptchaV3Provider(siteKey),
    isTokenAutoRefreshEnabled: true,
  });
}

export function getFirebase() {
  const instance = app();
  const auth = getAuth(instance);
  const db = getFirestore(instance);
  // Functions region must match the region the callables are deployed to.
  const functions = getFunctions(instance, "asia-south1");
  const storage = getStorage(instance);

  connectEmulatorsOnce(auth, db, functions, storage);
  initAppCheckOnce(instance);

  return { app: instance, auth, db, functions, storage };
}

export { USE_EMULATOR };
