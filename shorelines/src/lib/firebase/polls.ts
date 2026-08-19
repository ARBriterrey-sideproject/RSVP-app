import {
  addDoc,
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type Firestore,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./client";
import type { EventId } from "@/content/schema";

export interface PollOption {
  id: string;
  label: string;
}

/** Mirrors the doc shape the couple writes directly — see firestore.rules, `polls/{pollId}`. */
export interface Poll {
  id: string;
  question: string;
  options: PollOption[];
  status: "open" | "closed";
  eventId: EventId | null;
  createdAt: Timestamp | null;
  createdBy: string;
}

export function pollFromDoc(docSnap: QueryDocumentSnapshot): Poll {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    question: data.question,
    options: data.options ?? [],
    status: data.status,
    eventId: data.eventId ?? null,
    createdAt: data.createdAt ?? null,
    createdBy: data.createdBy,
  };
}

/**
 * All polls, newest first. Deliberately no `where("status", ...)` here — pairing
 * an equality filter with `orderBy` on a different field needs a composite index
 * this app doesn't define (`firestore.indexes.json` is empty by design). Open vs.
 * closed is a client-side filter instead, same "fine at this guest-list scale"
 * call already made for vote tallying below.
 */
export function pollsQuery(db: Firestore) {
  return query(collection(db, "polls"), orderBy("createdAt", "desc"));
}

export interface PollVote {
  id: string;
  pollId: string;
  optionId: string;
  ownerUid: string;
}

export function pollVoteFromDoc(docSnap: QueryDocumentSnapshot): PollVote {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    pollId: data.pollId,
    optionId: data.optionId,
    ownerUid: data.ownerUid,
  };
}

/** Every vote on one poll — tallied and checked for "have I voted" client-side. */
export function pollVotesQuery(db: Firestore, pollId: string) {
  return query(collection(db, "pollVotes"), where("pollId", "==", pollId));
}

interface CastVoteResult {
  ok: boolean;
}

/** One vote per guest per poll — the server enforces it via a deterministic doc id. */
export async function castVote(
  pollId: string,
  optionId: string
): Promise<CastVoteResult> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    { pollId: string; optionId: string },
    CastVoteResult
  >(functions, "castVote");
  const result = await call({ pollId, optionId });
  return result.data;
}

/**
 * Poll authoring is a direct Firestore write by the couple, not a callable —
 * `polls/{pollId}` has no invariant a rule (`allow write: if isCouple()`)
 * can't already enforce. Casting a vote is the one part that does, hence the
 * callable above.
 */
export async function createPoll(
  question: string,
  options: PollOption[],
  eventId: EventId | null,
  createdBy: string
): Promise<void> {
  const { db } = getFirebase();
  await addDoc(collection(db, "polls"), {
    question,
    options,
    status: "open",
    eventId,
    createdAt: serverTimestamp(),
    createdBy,
  });
}

export async function setPollStatus(
  pollId: string,
  status: "open" | "closed"
): Promise<void> {
  const { db } = getFirebase();
  await updateDoc(doc(db, "polls", pollId), { status });
}
