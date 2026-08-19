import {
  deleteObject,
  ref,
  uploadBytesResumable,
  type UploadTaskSnapshot,
} from "firebase/storage";
import {
  collection,
  getDocs,
  type QueryDocumentSnapshot,
  type Timestamp,
} from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./client";
import type { EventId } from "@/content/schema";

/** `photos/{eventId}/{ownerUid}/{fileId}` — see storage.rules. */
export async function uploadPhoto(
  eventId: EventId,
  ownerUid: string,
  file: File,
  onProgress?: (fraction: number) => void
): Promise<void> {
  const { storage } = getFirebase();
  const fileId = `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const storageRef = ref(storage, `photos/${eventId}/${ownerUid}/${fileId}`);
  const task = uploadBytesResumable(storageRef, file, {
    contentType: file.type,
  });

  await new Promise<void>((resolve, reject) => {
    task.on(
      "state_changed",
      (snapshot: UploadTaskSnapshot) => {
        onProgress?.(snapshot.bytesTransferred / snapshot.totalBytes);
      },
      reject,
      () => resolve()
    );
  });
}

export type AlbumVisibility = "shared" | "private";

/** Mirrors the doc `setAlbumVisibility` writes — see firestore.rules, `albumSettings/{eventId}`. */
export interface AlbumSetting {
  eventId: string;
  visibility: AlbumVisibility;
  updatedAt: Timestamp | null;
  updatedBy: string | null;
}

function albumSettingFromDoc(docSnap: QueryDocumentSnapshot): AlbumSetting {
  const data = docSnap.data();
  return {
    eventId: docSnap.id,
    visibility: data.visibility === "shared" ? "shared" : "private",
    updatedAt: data.updatedAt ?? null,
    updatedBy: data.updatedBy ?? null,
  };
}

/** Staff-only read (rules: `read: isStaff()`) — one doc per event that has ever been toggled. */
export async function listAlbumSettings(): Promise<AlbumSetting[]> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "albumSettings"));
  return snap.docs.map((doc) => albumSettingFromDoc(doc));
}

interface SetAlbumVisibilityResult {
  ok: boolean;
  eventId: string;
  visibility: AlbumVisibility;
}

/** The only write path onto `albumSettings` — admin-only, enforced server-side. */
export async function setAlbumVisibility(
  eventId: EventId,
  visibility: AlbumVisibility
): Promise<SetAlbumVisibilityResult> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    { eventId: EventId; visibility: AlbumVisibility },
    SetAlbumVisibilityResult
  >(functions, "setAlbumVisibility");
  const result = await call({ eventId, visibility });
  return result.data;
}

export interface EventPhoto {
  fullPath: string;
  name: string;
  url: string;
}

/**
 * Server-side listing via the `listEventPhotos` callable, not direct Storage
 * SDK calls — storage.rules' `photos/` read is couple-rank-only now, so a
 * coordinator granted photo access (see setStaffPhotoAccess) has no direct
 * SDK path and must go through here, where the Admin SDK checks the grant.
 */
export async function listEventPhotos(eventId: string): Promise<EventPhoto[]> {
  const { functions } = getFirebase();
  const call = httpsCallable<{ eventId: string }, { photos: EventPhoto[] }>(
    functions,
    "listEventPhotos"
  );
  const result = await call({ eventId });
  return result.data.photos;
}

/** Staff-only (rules: `allow delete: if isCouple()`). */
export async function deletePhoto(fullPath: string): Promise<void> {
  const { storage } = getFirebase();
  await deleteObject(ref(storage, fullPath));
}
