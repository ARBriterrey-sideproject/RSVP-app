"use client";

import { httpsCallable } from "firebase/functions";
import type { EmergencyContact } from "@/content/schema";
import { getFirebase } from "./client";

/**
 * The dashboard's write path into `config/live`.
 *
 * A callable, not a Firestore write, and the rules deny writes to that document
 * to everyone including admins. What the server does that a rule can't: reject
 * an event that would end before it starts. `mealsForEvents` windows a guest's
 * meals between their first event's start and their last event's end, so an
 * inverted pair doesn't error anywhere — it quietly returns no meals, and looks
 * like a guest who was simply never fed.
 */
export interface LiveConfigUpdate {
  /**
   * Keyed by event id. `null` clears the override and puts the compiled time
   * back. Both ends are required together: a start merged over a stale end is
   * exactly the inverted pair above.
   */
  events?: Record<string, { startsAt: string; endsAt: string } | null>;
  /** Keyed by schedule item id. `null` clears the override. */
  schedule?: Record<string, { startsAt: string } | null>;
  /**
   * Replaced wholesale, not merged — the dashboard edits this as a list, and
   * reordering and deletion are ordinary operations on a list that no
   * key-by-key merge survives.
   */
  emergencyContacts?: EmergencyContact[];
}

/**
 * Omit a section to leave it untouched. Sending `{}` is refused server-side
 * rather than treated as "clear everything".
 *
 * Rejects with a `FirebaseError` whose `message` is written to be shown: the
 * callable's validation strings name the field a person can see on screen
 * ("haldi would end before it starts"), so surfacing them beats a generic
 * failure.
 */
export async function updateWeddingLive(
  update: LiveConfigUpdate
): Promise<{ ok: boolean; updatedAt: string }> {
  const { functions } = getFirebase();
  const call = httpsCallable<LiveConfigUpdate, { ok: boolean; updatedAt: string }>(
    functions,
    "updateWeddingLive"
  );
  const result = await call(update);
  return result.data;
}
