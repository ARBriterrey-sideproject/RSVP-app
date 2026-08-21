import { httpsCallable } from "firebase/functions";
import { getFirebase } from "./client";
import type { StaffRole } from "@/lib/auth/roles";

export type StaffAccessStatus = "pending" | "approved" | "denied";

export interface StaffAccessRequest {
  /** `email:<lowercased>` or `phone:<e164>` — the key `decideStaffAccess` takes. */
  identity: string;
  kind: "email" | "phone";
  value: string;
  status: StaffAccessStatus;
  role: StaffRole | null;
  displayName: string | null;
  /** ISO-8601; Firestore Timestamps don't survive the callable round-trip. */
  requestedAt: string | null;
  decidedAt: string | null;
  decidedByIdentity: string | null;
}

export interface StaffRosterResult {
  email: { email: string; role: StaffRole }[];
  phone: { phone: string; role: StaffRole }[];
  /** Keyed by roster identity (`email:<lowercased>` / `phone:<e164>`) — see staffPhotoAccess in firestore.rules. */
  photoAccess: Record<string, boolean>;
  /** The approval queue, pending first. */
  requests: StaffAccessRequest[];
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

interface DecideStaffAccessResult {
  ok: boolean;
  identity: string;
  role: StaffRole | null;
  /** Whether the claim was applied straight away, or waits for their next sign-in. */
  applied: boolean;
}

/**
 * Approves a pending request with a role, or denies it with `null`. Admin rank
 * only, and the server refuses both self-decisions and env-roster identities.
 */
export async function decideStaffAccess(
  identity: string,
  role: StaffRole | null
): Promise<DecideStaffAccessResult> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    { identity: string; role: StaffRole | null },
    DecideStaffAccessResult
  >(functions, "decideStaffAccess");
  const result = await call({ identity, role });
  return result.data;
}

/**
 * "I'm staff, let me in" — puts the signed-in account in the approval queue.
 * Grants nothing; an admin still has to pick a role.
 */
export async function requestStaffAccess(): Promise<{
  status: StaffAccessStatus;
  identity: string;
}> {
  const { functions } = getFirebase();
  const call = httpsCallable<
    Record<string, never>,
    { status: StaffAccessStatus; identity: string }
  >(functions, "requestStaffAccess");
  const result = await call({});
  return result.data;
}
