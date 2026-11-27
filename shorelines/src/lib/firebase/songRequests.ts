import {
  collection,
  getDocs,
  orderBy,
  query,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./client";
import { songKey } from "@/lib/music/songKey";

/** The only event with a DJ, so the only one that takes requests. */
export const SONG_REQUEST_EVENT_ID = "sangeet";

export interface SongRequestInput {
  title: string;
  artist?: string;
  note?: string;
  trackId?: number;
  album?: string;
  artworkUrl?: string;
}

/** Mirrors the doc `submitSongRequest` writes — see firestore.rules, `songRequests/{requestId}`. */
export interface SongRequestRecord {
  id: string;
  eventId: string;
  ownerUid: string;
  title: string;
  artist: string;
  note: string;
  songKey: string;
  trackId: number | null;
  album: string | null;
  artworkUrl: string | null;
  matched: boolean;
  createdAt: Date | null;
}

function recordFromDoc(docSnap: QueryDocumentSnapshot): SongRequestRecord {
  const data = docSnap.data();
  const title: string = data.title ?? "";
  const artist: string = data.artist ?? "";
  const trackId: number | null =
    typeof data.trackId === "number" ? data.trackId : null;
  return {
    id: docSnap.id,
    eventId: data.eventId,
    ownerUid: data.ownerUid,
    title,
    artist,
    note: data.note ?? "",
    // Requests filed before songKey existed are keyed on read, same logic as the server's.
    songKey: typeof data.songKey === "string" ? data.songKey : songKey(title, artist),
    trackId,
    album: data.album ?? null,
    artworkUrl: data.artworkUrl ?? null,
    matched: typeof data.matched === "boolean" ? data.matched : trackId !== null,
    createdAt: data.createdAt?.toDate?.() ?? null,
  };
}

/**
 * Staff-only read (rules: `read: isStaff()`), newest first. A one-shot load
 * like `listRsvps` — nobody has asked this queue to update live, unlike chat
 * and poll results.
 */
export async function listSongRequests(): Promise<SongRequestRecord[]> {
  const { db } = getFirebase();
  const snap = await getDocs(
    query(collection(db, "songRequests"), orderBy("createdAt", "desc"))
  );
  return snap.docs.map((doc) => recordFromDoc(doc));
}

/**
 * The only write path — `songRequests` denies every direct client write. The
 * server derives the song key, re-checks the sign-in provider and the cutoff
 * itself; this is a convenience wrapper, not the enforcement. Asking for a
 * song you already asked for resolves with `alreadyRequested: true`.
 */
export async function submitSongRequest(
  input: SongRequestInput
): Promise<{ id: string; alreadyRequested: boolean }> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    SongRequestInput & { eventId: string },
    { id: string; alreadyRequested: boolean }
  >(functions, "submitSongRequest");
  const result = await call({ ...input, eventId: SONG_REQUEST_EVENT_ID });
  return result.data;
}

/** Maps a failed `submitSongRequest` onto a translatable message key. */
export function songRequestErrorKey(
  cause: unknown
): "signIn" | "closed" | "limit" | "invalid" | "sendFailed" {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? String((cause as { code: unknown }).code)
      : "";
  switch (code) {
    case "functions/unauthenticated":
      return "signIn";
    case "functions/failed-precondition":
      return "closed";
    case "functions/resource-exhausted":
      return "limit";
    case "functions/invalid-argument":
      return "invalid";
    default:
      return "sendFailed";
  }
}
