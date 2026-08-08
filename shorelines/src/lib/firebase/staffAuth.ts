"use client";

import {
  GoogleAuthProvider,
  browserLocalPersistence,
  browserSessionPersistence,
  createUserWithEmailAndPassword,
  getIdTokenResult,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { httpsCallable } from "firebase/functions";
import { isStaffRole, type StaffRole } from "@/lib/auth/roles";
import { getFirebase } from "./client";

/**
 * Sign-in for the couple and their coordinators — a wholly separate path from
 * the guests' phone OTP. Guests never touch this module and staff never touch
 * the OTP one; the only thing they share is the Firebase Auth instance.
 *
 * Email + password because the couple asked for a password, and Google because
 * it is the "auto login" in practice: one tap, nothing to remember, and the
 * address arrives already verified so the role can be granted immediately.
 */

/**
 * "Stay signed in" is the whole auto-login feature, and it is one line.
 *
 * `browserLocalPersistence` (Firebase's default) keeps the session in
 * IndexedDB, so closing the tab, quitting the browser or rebooting the phone
 * all leave the bride signed in — indefinitely, until she signs out. The
 * session variant lasts only until the tab closes, which is what you want on a
 * borrowed laptop at the venue.
 *
 * Must be set BEFORE the sign-in call or it applies only to the next session.
 */
async function applyPersistence(staySignedIn: boolean) {
  const { auth } = getFirebase();
  await setPersistence(
    auth,
    staySignedIn ? browserLocalPersistence : browserSessionPersistence
  );
}

export async function signInWithPassword(
  email: string,
  password: string,
  staySignedIn: boolean
): Promise<User> {
  const { auth } = getFirebase();
  await applyPersistence(staySignedIn);
  const credential = await signInWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );
  return credential.user;
}

export async function signInWithGoogle(staySignedIn: boolean): Promise<User> {
  const { auth } = getFirebase();
  await applyPersistence(staySignedIn);

  const provider = new GoogleAuthProvider();
  // Always show the chooser: several of these people share a laptop, and
  // silently reusing whichever Google account was last used is how a
  // coordinator ends up looking at the couple's screen.
  provider.setCustomParameters({ prompt: "select_account" });

  const credential = await signInWithPopup(auth, provider);
  return credential.user;
}

/**
 * First-time password setup. Self-service on purpose: creating an account grants
 * nothing at all — the role comes from the server-side roster, and only after
 * the address is verified. So an uninvited signup is an inert account, not a
 * foothold.
 */
export async function registerWithPassword(
  email: string,
  password: string,
  staySignedIn: boolean
): Promise<User> {
  const { auth } = getFirebase();
  await applyPersistence(staySignedIn);
  const credential = await createUserWithEmailAndPassword(
    auth,
    email.trim(),
    password
  );
  await sendEmailVerification(credential.user);
  return credential.user;
}

export async function resendVerification(user: User): Promise<void> {
  await sendEmailVerification(user);
}

export async function sendPasswordReset(email: string): Promise<void> {
  const { auth } = getFirebase();
  await sendPasswordResetEmail(auth, email.trim());
}

export async function signOutStaff(): Promise<void> {
  const { auth } = getFirebase();
  await signOut(auth);
}

/**
 * Reconciles this account's role with the server roster, then returns it.
 *
 * The two token refreshes are both load-bearing and are the part that is easy
 * to get wrong:
 *
 *  1. Before the call, because the server reads `email_verified` off the token.
 *     Someone who just clicked the verification link in another tab still holds
 *     a token saying `false`, and would be told to check their inbox again.
 *  2. After the call, because `setCustomUserClaims` does not touch tokens
 *     already issued. Without this the new role is invisible to Firestore rules
 *     for up to an hour, and the couple would have to sign out and back in.
 */
export async function syncRole(user: User): Promise<StaffRole | null> {
  const { functions } = getFirebase();

  await user.reload();
  await user.getIdToken(true);

  const call = httpsCallable<undefined, { role: string | null; changed: boolean }>(
    functions,
    "syncRole"
  );
  const { data } = await call();

  if (data.changed) await user.getIdToken(true);

  return isStaffRole(data.role) ? data.role : null;
}

/**
 * The role as the *token* currently states it — which is what Firestore rules
 * will actually enforce. Read this rather than trusting the callable's return
 * value, so the UI can never offer a button the rules would reject.
 */
export async function readRoleFromToken(user: User): Promise<StaffRole | null> {
  const { claims } = await getIdTokenResult(user);
  return isStaffRole(claims.role) ? claims.role : null;
}
