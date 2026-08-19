import {
  collection,
  collectionGroup,
  orderBy,
  query,
  type Firestore,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./client";

/** Mirrors the doc shape `sendChatMessage` writes — see functions/src/index.ts. */
export interface ChatMessage {
  id: string;
  ownerUid: string;
  authorRole: "guest" | "staff";
  name: string;
  text: string;
  createdAt: Timestamp | null;
  flagged: boolean;
}

/** `"group"` (everyone) or `dm_{ownerUid}` (one guest's private concierge thread). */
export function chatMessagesQuery(db: Firestore, roomId: string) {
  return query(
    collection(db, "chats", roomId, "messages"),
    orderBy("createdAt", "asc")
  );
}

export function conciergeRoomId(ownerUid: string): string {
  return `dm_${ownerUid}`;
}

/**
 * Every message in every room, for staff only — the rules let a staff account
 * read both "group" and any "dm_*" thread, so one listener covers the group
 * room and the full list of concierge threads at once. Fine at this app's
 * guest-list scale (under 1,000); a message doc doesn't carry its own roomId,
 * so pair this with `roomIdOf` to recover which room a snapshot doc came from.
 */
export function allChatMessagesQuery(db: Firestore) {
  return query(collectionGroup(db, "messages"), orderBy("createdAt", "asc"));
}

export function roomIdOf(docSnap: QueryDocumentSnapshot): string {
  return docSnap.ref.parent.parent!.id;
}

interface SendChatMessageResult {
  ok: boolean;
  id: string;
}

/**
 * Send into "group" or a concierge thread. A guest may only target "group" or
 * their own `dm_{uid}`; staff may target any room — the server re-checks both.
 */
export async function sendChatMessage(
  roomId: string,
  text: string,
  name?: string
): Promise<SendChatMessageResult> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    { roomId: string; text: string; name?: string },
    SendChatMessageResult
  >(functions, "sendChatMessage");
  const result = await call({ roomId, text, name });
  return result.data;
}

export type ChatModerationAction = "flag" | "unflag" | "delete";

interface ModerateChatMessageResult {
  ok: boolean;
  roomId: string;
  messageId: string;
  action: ChatModerationAction;
}

/** Flag, unflag or delete a message. Coordinator rank and up (`moderateChat`). */
export async function moderateChatMessage(
  roomId: string,
  messageId: string,
  action: ChatModerationAction
): Promise<ModerateChatMessageResult> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    { roomId: string; messageId: string; action: ChatModerationAction },
    ModerateChatMessageResult
  >(functions, "moderateChatMessage");
  const result = await call({ roomId, messageId, action });
  return result.data;
}
