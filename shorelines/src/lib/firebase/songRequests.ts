import {
  collection,
  getDocs,
  orderBy,
  query,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./client";
import type { EventId } from "@/content/schema";

/** Mirrors the doc `submitSongRequest` writes — see firestore.rules, `songRequests/{requestId}`. */
export interface SongRequest {
  id: string;
  eventId: EventId;
  ownerUid: string;
  title: string;
  artist: string | null;
  note: string | null;
  createdAt: Timestamp | null;
}

export function songRequestFromDoc(docSnap: QueryDocumentSnapshot): SongRequest {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    eventId: data.eventId,
    ownerUid: data.ownerUid,
    title: data.title,
    artist: data.artist ?? null,
    note: data.note ?? null,
    createdAt: data.createdAt ?? null,
  };
}

/**
 * Staff-only read (rules: `read: isStaff()`), newest first. A one-shot load
 * like `listRsvps` — nobody has asked this queue to update live, unlike chat
 * and poll results.
 */
export async function listSongRequests(): Promise<SongRequest[]> {
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, "songRequests"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((doc) => songRequestFromDoc(doc));
}

interface SubmitSongRequestResult {
  ok: boolean;
  id: string;
}

/**
 * The only write path — `songRequests` denies every direct client write. The
 * server re-checks attendance and the 1-hour cutoff itself; this is a
 * convenience wrapper, not the enforcement.
 */
export async function submitSongRequest(
  eventId: EventId,
  title: string,
  artist?: string,
  note?: string
): Promise<SubmitSongRequestResult> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    { eventId: EventId; title: string; artist?: string; note?: string },
    SubmitSongRequestResult
  >(functions, "submitSongRequest");
  const result = await call({ eventId, title, artist, note });
  return result.data;
}
