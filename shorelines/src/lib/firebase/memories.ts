import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getFirebase } from "./client";

/**
 * The one direct client write in the app — see CLAUDE.md's memories section.
 * Rules require only `ownerUid == request.auth.uid`; there's nothing else to
 * validate, so no callable exists for this.
 */
export async function sendMemory(ownerUid: string, message: string): Promise<void> {
  const { db } = getFirebase();
  await addDoc(collection(db, "memories"), {
    ownerUid,
    message,
    createdAt: serverTimestamp(),
  });
}
