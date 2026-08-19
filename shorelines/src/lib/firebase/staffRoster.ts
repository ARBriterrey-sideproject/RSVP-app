import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./client";
import type { StaffRole } from "@/lib/auth/roles";

export interface StaffRosterResult {
  email: { email: string; role: StaffRole }[];
  phone: { phone: string; role: StaffRole }[];
  /** Keyed by roster identity (`email:<lowercased>` / `phone:<e164>`) — see staffPhotoAccess in firestore.rules. */
  photoAccess: Record<string, boolean>;
}

/** Read-only view of the roster. Admin rank only — see functions/src/index.ts. */
export async function getStaffRoster(): Promise<StaffRosterResult> {
  const { functions } = getFirebase();
  const call = httpsCallable<Record<string, never>, StaffRosterResult>(
    functions,
    "getStaffRoster"
  );
  const result = await call({});
  return result.data;
}

interface SetStaffPhotoAccessResult {
  ok: boolean;
  identity: string;
  allowed: boolean;
}

/** Grants or revokes one coordinator's photo-view access. Admin rank only. */
export async function setStaffPhotoAccess(
  kind: "email" | "phone",
  value: string,
  allowed: boolean
): Promise<SetStaffPhotoAccessResult> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    { kind: "email" | "phone"; value: string; allowed: boolean },
    SetStaffPhotoAccessResult
  >(functions, "setStaffPhotoAccess");
  const result = await call({ kind, value, allowed });
  return result.data;
}
