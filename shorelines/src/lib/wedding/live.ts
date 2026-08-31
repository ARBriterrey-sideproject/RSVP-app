import "server-only";

import { applyOverlay } from "@/content/overlay";
import { getWeddingConfig } from "@/content/wedding";
import type { WeddingConfig, WeddingOverlay } from "@/content/schema";

/**
 * READING THE RUNTIME OVERLAY, SERVER-SIDE.
 *
 * Over the Firestore REST API with a plain `fetch`, rather than the client SDK
 * or `firebase-admin`. Three reasons, in order of weight:
 *
 *   1. `fetch` is the thing Next caches. `next: { revalidate, tags }` gives one
 *      Firestore read per minute across every guest hitting the landing, for
 *      free — an SDK call is opaque to the cache and would be a read per render.
 *   2. No new dependency and no service-account credential. `config/live` is a
 *      public `get` in the rules by design (see the note there), so an
 *      unauthenticated read is the *correct* level of access, not a shortcut.
 *   3. It works identically against the emulator, so this path is exercised in
 *      development rather than only in production.
 *
 * The one cost is decoding Firestore's REST value envelope by hand, below.
 */

// Port override: see the note beside connectFirestoreEmulator in
// src/lib/firebase/client.ts — the two have to agree.
const EMULATOR_HOST = `http://127.0.0.1:${
  process.env.NEXT_PUBLIC_FIRESTORE_EMULATOR_PORT ?? "8080"
}`;

export interface ReadOptions {
  /**
   * Skip the shared cache. For the dashboard only: the person reading it is the
   * person who just wrote it, and being shown their own edit as not-yet-applied
   * for up to a minute reads as a failed save and invites a second one.
   *
   * Never set this on a guest route. It turns one Firestore read a minute into
   * one per visitor.
   */
  fresh?: boolean;
}

function documentUrl(): string | null {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;

  const base =
    process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true"
      ? EMULATOR_HOST
      : "https://firestore.googleapis.com";

  return `${base}/v1/projects/${projectId}/databases/(default)/documents/config/live`;
}

/**
 * The overlay as last written, or `null` if there isn't one.
 *
 * `null` is the ordinary case, not an error: before the couple touches the
 * dashboard the document does not exist, and the literal is the whole truth.
 *
 * Nothing in here throws. A wedding site that 500s because a config read timed
 * out is a worse outcome than a wedding site showing last week's times, and the
 * times in the literal are never nonsense — they are what the couple last
 * shipped. Failures are logged once and swallowed.
 */
export async function getWeddingOverlay(
  options: ReadOptions = {}
): Promise<WeddingOverlay | null> {
  const url = documentUrl();
  if (!url) return null;

  try {
    const response = await fetch(url, {
      /*
       * 60s rather than a tag revalidated on write. The write path is a
       * callable — the browser talks to Cloud Functions, not to this server —
       * so busting the tag would mean exposing a revalidation route and
       * guarding it, a new auth surface for a minute of staleness. The tag is
       * declared anyway so that route can be added later without touching this.
       */
      ...(options.fresh
        ? { cache: "no-store" as const }
        : { next: { revalidate: 60, tags: ["wedding-live"] } }),
    });

    // 404 is "no overlay yet". Anything else non-OK is a real fault.
    if (response.status === 404) return null;
    if (!response.ok) {
      console.error(`[wedding] config/live read failed: ${response.status}`);
      return null;
    }

    const body = (await response.json()) as { fields?: Record<string, RestValue> };
    return decodeOverlay(body.fields);
  } catch (error) {
    console.error("[wedding] config/live unreachable", error);
    return null;
  }
}

/**
 * The config to render, literal merged with whatever the couple has since
 * changed. This is what pages should call — never `getWeddingConfig()` directly
 * on a path a guest sees.
 */
export async function getLiveWeddingConfig(
  options: ReadOptions = {}
): Promise<WeddingConfig> {
  return applyOverlay(getWeddingConfig(), await getWeddingOverlay(options));
}

/**
 * Both halves, from a single read — for the dashboard, which needs the merged
 * config to show what guests currently see *and* the raw overlay to show which
 * of those values were changed by hand and to list the emergency contacts,
 * which exist nowhere else.
 *
 * Guest routes want `getLiveWeddingConfig` instead. The overlay is an
 * implementation detail everywhere except the screen that edits it.
 */
export async function getLiveWeddingSnapshot(
  options: ReadOptions = {}
): Promise<{ config: WeddingConfig; overlay: WeddingOverlay | null }> {
  const overlay = await getWeddingOverlay(options);
  return { config: applyOverlay(getWeddingConfig(), overlay), overlay };
}

/* -------------------------------------------------------------------------
 * Firestore REST decoding.
 *
 * The REST API returns every value wrapped in a one-key object naming its type
 * — `{"stringValue": "…"}`, `{"mapValue": {"fields": {…}}}`. The SDKs hide this;
 * over `fetch` it has to be unwrapped. Kept narrow on purpose: only the types
 * the overlay can actually contain are handled, so an unexpected shape decodes
 * to `undefined` and is dropped by the guards in `applyOverlay` rather than
 * being coerced into something plausible.
 * ---------------------------------------------------------------------- */

type RestValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  mapValue?: { fields?: Record<string, RestValue> };
  arrayValue?: { values?: RestValue[] };
};

function decodeValue(value: RestValue | undefined): unknown {
  if (!value) return undefined;
  if (value.stringValue !== undefined) return value.stringValue;
  if (value.booleanValue !== undefined) return value.booleanValue;
  if (value.integerValue !== undefined) return Number(value.integerValue);
  if (value.doubleValue !== undefined) return value.doubleValue;
  if (value.mapValue !== undefined) return decodeFields(value.mapValue.fields);
  if (value.arrayValue !== undefined)
    return (value.arrayValue.values ?? []).map(decodeValue);
  return undefined;
}

function decodeFields(
  fields: Record<string, RestValue> | undefined
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields ?? {})) {
    out[key] = decodeValue(value);
  }
  return out;
}

/**
 * Shapes the decoded document as a `WeddingOverlay` without asserting it is
 * one. Every field stays optional and every value is checked for type at the
 * point it is used — `applyOverlay` drops a `startsAt` that isn't a valid
 * instant, and a contact missing a name never renders. The document is written
 * only by a validating callable, so this is defence in depth against an older
 * write or a hand-edited emulator, not the primary check.
 */
function decodeOverlay(
  fields: Record<string, RestValue> | undefined
): WeddingOverlay | null {
  if (!fields) return null;
  const raw = decodeFields(fields);

  return {
    events: asRecordOfRecords(raw.events),
    schedule: asRecordOfRecords(raw.schedule),
    emergencyContacts: asContacts(raw.emergencyContacts),
    songRequestsOverride:
      typeof raw.songRequestsOverride === "boolean"
        ? raw.songRequestsOverride
        : undefined,
    updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : undefined,
    updatedBy: typeof raw.updatedBy === "string" ? raw.updatedBy : undefined,
  };
}

function asRecordOfRecords(
  value: unknown
): Record<string, { startsAt?: string; endsAt?: string }> | undefined {
  if (!isPlainObject(value)) return undefined;

  const out: Record<string, { startsAt?: string; endsAt?: string }> = {};
  for (const [id, patch] of Object.entries(value)) {
    if (!isPlainObject(patch)) continue;
    out[id] = {
      startsAt: typeof patch.startsAt === "string" ? patch.startsAt : undefined,
      endsAt: typeof patch.endsAt === "string" ? patch.endsAt : undefined,
    };
  }
  return out;
}

function asContacts(value: unknown): WeddingOverlay["emergencyContacts"] {
  if (!Array.isArray(value)) return undefined;

  return value.flatMap((entry) => {
    if (!isPlainObject(entry)) return [];
    const { id, name, role, phone } = entry;
    if (typeof id !== "string" || typeof name !== "string") return [];
    if (typeof role !== "string" || typeof phone !== "string") return [];
    return [{ id, name, role, phone }];
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
