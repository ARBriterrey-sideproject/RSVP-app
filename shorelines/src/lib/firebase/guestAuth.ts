"use client";

import { FirebaseError } from "firebase/app";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getRedirectResult,
  linkWithPopup,
  linkWithRedirect,
  setPersistence,
  signInWithCredential,
  signInWithPopup,
  signInWithRedirect,
  type User,
} from "firebase/auth";
import { getFirebase } from "./client";

/**
 * Guest sign-in for the venue QR (`/join`).
 *
 * Deliberately separate from `staffAuth.ts`: that file's Google flow ends in
 * `syncRole` and a role claim; this one only wants a durable, non-anonymous
 * session so a guest at the venue can use chat, polls, photos and memories.
 * A Google session is *not* an RSVP identity — `RsvpFlow.isVerified` requires
 * a phone number, so one-number-one-reply is untouched.
 */

/** Errors that mean "the guest changed their mind", not "something broke". */
const SILENT_CODES = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
  "auth/user-cancelled",
]);

/** Popups that the browser (or an in-app webview) will not open. */
const POPUP_UNAVAILABLE_CODES = new Set([
  "auth/popup-blocked",
  "auth/operation-not-supported-in-this-environment",
]);

export function isSilentAuthError(error: unknown): boolean {
  return error instanceof FirebaseError && SILENT_CODES.has(error.code);
}

/**
 * Must run before the sign-in call (it only affects the next session). A staff
 * member who ticked "don't stay signed in" earlier in this tab would otherwise
 * leave the guest on session persistence, and a venue guest who closes the tab
 * would lose their chat identity.
 */
export async function ensureLocalPersistence() {
  const { auth } = getFirebase();
  await setPersistence(auth, browserLocalPersistence);
}

function newProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/**
 * Trades a `credential-already-in-use` failure for a plain sign-in with the
 * credential Firebase hands back — the Google account already exists, so the
 * anonymous session can't be linked to it and is simply replaced.
 */
async function signInWithExistingCredential(error: unknown): Promise<User> {
  const { auth } = getFirebase();
  const credential =
    error instanceof FirebaseError
      ? GoogleAuthProvider.credentialFromError(error)
      : null;
  if (!credential) throw error;
  return (await signInWithCredential(auth, credential)).user;
}

function isCredentialInUse(error: unknown): boolean {
  return (
    error instanceof FirebaseError &&
    error.code === "auth/credential-already-in-use"
  );
}

/**
 * Continue with Google.
 *
 * Resolves with the signed-in user, or `null` when it handed off to a full-page
 * redirect (the page is about to unload; `completeGoogleRedirect` finishes the
 * job on the way back).
 *
 * If the guest holds an anonymous session — /polls, /memories and /photos
 * create one — it is linked rather than replaced, so votes and uploads they
 * already made stay under the same uid.
 */
export async function signInGuestWithGoogle(): Promise<User | null> {
  const { auth } = getFirebase();
  await ensureLocalPersistence();
  const provider = newProvider();
  const current = auth.currentUser;
  const anonymous = current !== null && current.isAnonymous;

  try {
    if (anonymous && current) {
      try {
        return (await linkWithPopup(current, provider)).user;
      } catch (error) {
        if (isCredentialInUse(error)) return await signInWithExistingCredential(error);
        throw error;
      }
    }
    return (await signInWithPopup(auth, provider)).user;
  } catch (error) {
    if (error instanceof FirebaseError && POPUP_UNAVAILABLE_CODES.has(error.code)) {
      if (anonymous && current) {
        await linkWithRedirect(current, provider);
      } else {
        await signInWithRedirect(auth, provider);
      }
      return null;
    }
    throw error;
  }
}

/**
 * Finishes a Google sign-in that went through `signInWithRedirect` /
 * `linkWithRedirect`. Call once on mount; resolves with the user, or `null`
 * when there was no redirect pending.
 */
export async function completeGoogleRedirect(): Promise<User | null> {
  const { auth } = getFirebase();
  try {
    const result = await getRedirectResult(auth);
    return result?.user ?? null;
  } catch (error) {
    if (isCredentialInUse(error)) return await signInWithExistingCredential(error);
    throw error;
  }
}
