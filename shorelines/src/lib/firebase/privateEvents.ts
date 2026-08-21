import { collection, getDocs } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./client";
import type { PrivateEvent } from "@/content/schema";

/**
 * Private events, from both sides.
 *
 * Staff list them straight from Firestore (`isStaff()` allows `list`), because
 * the dashboard panel has to show what exists before anything can be edited.
 * Guests cannot read the collection at all and go through `myPrivateEvents`,
 * which resolves the answer server-side from their own reply. Keeping both in
 * one file is deliberate: the asymmetry is the security model, and splitting it
 * across two files is how someone later "simplifies" the guest path into a
 * direct read.
 */

/** Every private event, for the dashboard. Any staff rank may read. */
export async function listPrivateEvents(): Promise<PrivateEvent[]> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "privateEvents"));
  return snap.docs
    .map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: typeof data.name === "string" ? data.name : "",
        startsAt: typeof data.startsAt === "string" ? data.startsAt : "",
        endsAt: typeof data.endsAt === "string" ? data.endsAt : "",
        venue: typeof data.venue === "string" ? data.venue : "",
        mapsQuery: typeof data.mapsQuery === "string" ? data.mapsQuery : "",
        dressCode: typeof data.dressCode === "string" ? data.dressCode : "",
        note: typeof data.note === "string" ? data.note : "",
      } satisfies PrivateEvent;
    })
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Creates a private event, or edits the one `id` names. Couple rank or above. */
export async function savePrivateEvent(
  event: Omit<PrivateEvent, "id"> & { id?: string }
): Promise<string> {
  const { functions } = getFirebase();
  const call = httpsCallable<typeof event, { ok: boolean; id: string }>(
    functions,
    "savePrivateEvent"
  );
  const result = await call(event);
  return result.data.id;
}

/**
 * Deletes a private event and every guest's invite to it. Couple rank or above.
 * Returns how many guests lost their invite, so the panel can say so before
 * anyone wonders where a guest list went.
 */
export async function deletePrivateEvent(id: string): Promise<number> {
  const { functions } = getFirebase();
  const call = httpsCallable<{ id: string }, { ok: boolean; revoked: number }>(
    functions,
    "deletePrivateEvent"
  );
  const result = await call({ id });
  return result.data.revoked;
}

/** Names one guest for one private event, or takes them off it. Couple rank or above. */
export async function setPrivateEventInvite(
  eventId: string,
  ownerUid: string,
  invited: boolean
): Promise<void> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    { eventId: string; ownerUid: string; invited: boolean },
    { ok: boolean }
  >(functions, "setPrivateEventInvite");
  await call({ eventId, ownerUid, invited });
}

/**
 * The private events this guest has been named for — the only way a guest ever
 * learns one exists. Returns `[]` for a guest who hasn't replied or hasn't been
 * named, which are deliberately the same answer.
 */
export async function myPrivateEvents(): Promise<PrivateEvent[]> {
  const { functions } = getFirebase();
  const call = httpsCallable<void, { events: PrivateEvent[] }>(
    functions,
    "getMyPrivateEvents"
  );
  const result = await call();
  return result.data.events ?? [];
}
