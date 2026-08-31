import { collection, getDocs, type Timestamp } from "firebase/firestore";
import { getFirebase } from "./client";
import type { DietaryOption, EventId, Tier, TransportMode } from "@/content/wedding";

/**
 * The shape `submitRsvp` writes to `rsvps/{ownerUid}` — see
 * functions/src/index.ts. Read-only mirror for the staff dashboard; nothing
 * here writes back to Firestore directly, since the rules refuse every client
 * write to this collection regardless of role.
 */
export interface RsvpRecord {
  ownerUid: string;
  tier: Tier;
  language: string;
  party: { name: string; ageGroup: "adult" | "child"; dietary: DietaryOption }[];
  partySize: number;
  perEventAttendance: Partial<Record<EventId, boolean>>;
  travel: {
    arrivalOn: string | null;
    departureOn: string | null;
    mode: TransportMode | null;
    serviceNumber: string | null;
    wantsPickup: boolean;
  };
  notes: string;
  /** The editable "call me on" number from the party step. Proves nothing. */
  submittedByPhone: string | null;
  /**
   * The number this reply is provably tied to — read off the auth token by
   * `submitRsvp`, never client-supplied, and the reason two replies can't share
   * one. Null only on a reply filed before the phone gate existed.
   */
  verifiedPhone: string | null;
  shareCode: string;
  recoveryCode: string;
  flagged: boolean;
  /** Which private events this guest has been named for. Written only by setPrivateEventInvite. */
  invitedPrivateEventIds: string[];
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

/**
 * Every reply, straight from Firestore — the rules allow `list` on `rsvps` for
 * any signed-in staff account (`isStaff()`), so this is one read for whichever
 * panel needs the full guest list: Replies, Travel & pickups, Private events.
 * Under 1,000 guests, so no pagination.
 */
export async function listRsvps(): Promise<RsvpRecord[]> {
  const { db } = getFirebase();
  const snap = await getDocs(collection(db, "rsvps"));
  return snap.docs.map((doc) => {
    const data = doc.data();
    return {
      ownerUid: doc.id,
      tier: data.tier,
      language: data.language,
      party: Array.isArray(data.party) ? data.party : [],
      partySize: typeof data.partySize === "number" ? data.partySize : 0,
      perEventAttendance:
        typeof data.perEventAttendance === "object" && data.perEventAttendance
          ? data.perEventAttendance
          : {},
      travel: data.travel ?? {
        arrivalOn: null,
        departureOn: null,
        mode: null,
        serviceNumber: null,
        wantsPickup: false,
      },
      notes: typeof data.notes === "string" ? data.notes : "",
      submittedByPhone:
        typeof data.submittedByPhone === "string" ? data.submittedByPhone : null,
      verifiedPhone:
        typeof data.verifiedPhone === "string" ? data.verifiedPhone : null,
      shareCode: typeof data.shareCode === "string" ? data.shareCode : "",
      recoveryCode: typeof data.recoveryCode === "string" ? data.recoveryCode : "",
      flagged: data.flagged === true,
      invitedPrivateEventIds: Array.isArray(data.invitedPrivateEventIds)
        ? data.invitedPrivateEventIds.filter(
            (id: unknown): id is string => typeof id === "string"
          )
        : [],
      createdAt: data.createdAt ?? null,
      updatedAt: data.updatedAt ?? null,
    } satisfies RsvpRecord;
  });
}

/** Best-effort display name for a reply — party[0] is the only required name. */
export function leadName(record: RsvpRecord): string {
  return record.party[0]?.name?.trim() || "Unnamed guest";
}
