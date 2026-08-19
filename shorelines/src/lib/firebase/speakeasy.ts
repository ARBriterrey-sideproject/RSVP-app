import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./client";

/** Grants or revokes a guest's invite to the speakeasy. Couple rank or above. */
export async function setSpeakeasyInvite(
  ownerUid: string,
  invited: boolean
): Promise<{ ok: boolean; ownerUid: string; invited: boolean }> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    { ownerUid: string; invited: boolean },
    { ok: boolean; ownerUid: string; invited: boolean }
  >(functions, "setSpeakeasyInvite");
  const result = await call({ ownerUid, invited });
  return result.data;
}
