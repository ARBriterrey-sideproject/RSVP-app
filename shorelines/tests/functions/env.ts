import { getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Shared wiring for the callable hostile-case suite. Unlike tests/rules,
 * these hit the *Functions* emulator over plain HTTP, not a rules-unit-testing
 * SDK — there is no such SDK for callables, and the point is to act like a
 * client the app never ships: forged claims, a stale/absent auth header, a
 * tier the link never handed out. See CLAUDE.md's "hostile client" section
 * for the unsigned-JWT trick this relies on.
 *
 * The admin SDK here is for setup/verification only (seeding a roster user,
 * reading back what a callable wrote) — never as a stand-in for what the
 * callable itself should be enforcing.
 */

export const PROJECT_ID = "demo-shorelines";
export const REGION = "asia-south1";

// Ports match firebase.json, but stay overridable — see the note in
// tests/rules/env.ts on why hardcoding 8080 doesn't survive contact with a
// machine that has anything else running on it.
const port = (name: string, fallback: number) =>
  process.env[name] ?? String(fallback);

const FIRESTORE_HOST = `127.0.0.1:${port("FIRESTORE_EMULATOR_PORT", 8080)}`;
const AUTH_HOST = `127.0.0.1:${port("AUTH_EMULATOR_PORT", 9099)}`;
const FUNCTIONS_ORIGIN = `http://127.0.0.1:${port("FUNCTIONS_EMULATOR_PORT", 5001)}`;

process.env.FIRESTORE_EMULATOR_HOST ??= FIRESTORE_HOST;
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= AUTH_HOST;
process.env.GCLOUD_PROJECT ??= PROJECT_ID;

let app: App;
export function adminApp(): App {
  if (!app) {
    app = getApps()[0] ?? initializeApp({ projectId: PROJECT_ID });
  }
  return app;
}

export function adminDb(): Firestore {
  return getFirestore(adminApp());
}

export function adminAuth() {
  return getAuth(adminApp());
}

function base64url(input: object | string): string {
  const json = typeof input === "string" ? input : JSON.stringify(input);
  return Buffer.from(json).toString("base64url");
}

/**
 * An unsigned (`alg: none`) ID token the Functions emulator accepts without
 * verifying a signature — the only way to act as a client sending claims the
 * real app would never construct (a forged role, a forged tier). Firebase's
 * *production* verifier would reject this outright; the emulator's more
 * permissive check is what makes hostile-input testing possible at all.
 *
 * `extraClaims` is merged at the top level, not nested — that's where
 * `request.auth.token.role` / `.email` / `.email_verified` are read from in
 * functions/src/index.ts.
 */
export function forgedToken(uid: string, extraClaims: Record<string, unknown> = {}): string {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "none", typ: "JWT" };
  const payload = {
    iss: `https://securetoken.google.com/${PROJECT_ID}`,
    aud: PROJECT_ID,
    sub: uid,
    user_id: uid,
    auth_time: now,
    iat: now,
    exp: now + 3600,
    firebase: { sign_in_provider: "custom", identities: {} },
    ...extraClaims,
  };
  return `${base64url(header)}.${base64url(payload)}.`;
}

export interface CallResult<T = unknown> {
  status: number;
  result?: T;
  error?: { status?: string; message?: string };
}

/**
 * Calls a callable's HTTP trigger directly (not the client SDK), so a test
 * can omit the Authorization header entirely or send a token the SDK would
 * never let a caller construct. Callables reply `{result: ...}` on success
 * and `{error: {...}}` — with a matching HTTP status — on an HttpsError.
 */
export async function callFunction<T = unknown>(
  name: string,
  data: unknown,
  token?: string
): Promise<CallResult<T>> {
  const res = await fetch(`${FUNCTIONS_ORIGIN}/${PROJECT_ID}/${REGION}/${name}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ data }),
  });
  const body = (await res.json()) as { result?: T; error?: CallResult["error"] };
  return { status: res.status, result: body.result, error: body.error };
}

/** Decodes a JWT's payload without verifying it — for asserting on claims the test itself minted or received back (e.g. a custom token's `uid`). */
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const [, payload] = token.split(".");
  return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
}

let counter = 0;
/** A fresh, collision-free uid per test — Auth emulator uids are just strings. */
export function freshUid(prefix: string): string {
  counter += 1;
  return `${prefix}-${Date.now()}-${counter}`;
}

/**
 * The Auth emulator is one long-running process shared by the whole test
 * session (see CLAUDE.md), not reset between `vitest run` invocations the
 * way Firestore is — so a roster email/phone reused across runs collides
 * with a leftover user from an earlier run. Deleting any existing holder
 * first makes a test that seeds a specific roster identity re-runnable.
 */
export async function deleteExistingUser(by: { email?: string; phoneNumber?: string }): Promise<void> {
  const auth = adminAuth();
  try {
    const existing = by.email ? await auth.getUserByEmail(by.email) : await auth.getUserByPhoneNumber(by.phoneNumber!);
    await auth.deleteUser(existing.uid);
  } catch {
    // No existing user — nothing to clean up.
  }
}
