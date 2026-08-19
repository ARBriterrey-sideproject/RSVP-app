import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./client";

/** Flags or unflags a reply for the couple's attention. Couple rank or above. */
export async function flagResponse(
  ownerUid: string,
  flagged: boolean
): Promise<{ ok: boolean; ownerUid: string; flagged: boolean }> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    { ownerUid: string; flagged: boolean },
    { ok: boolean; ownerUid: string; flagged: boolean }
  >(functions, "flagResponse");
  const result = await call({ ownerUid, flagged });
  return result.data;
}

/** Deletes a bogus reply and its shared-invite mirror. Couple rank or above. */
export async function deleteResponse(
  ownerUid: string
): Promise<{ ok: boolean; ownerUid: string }> {
  const { functions } = getFirebase();
  const call = httpsCallable<{ ownerUid: string }, { ok: boolean; ownerUid: string }>(
    functions,
    "deleteResponse"
  );
  const result = await call({ ownerUid });
  return result.data;
}
