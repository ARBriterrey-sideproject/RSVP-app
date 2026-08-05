import { randomBytes } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";

initializeApp();
const db = getFirestore();

// asia-south1 (Mumbai) — guests and the couple are in India; this is the
// nearest region and it must match getFunctions(app, region) on the client.
const REGION = "asia-south1";

const TIERS = ["full", "wedding_only", "reception_only"] as const;
type Tier = (typeof TIERS)[number];

const EVENT_IDS = [
  "mehendi",
  "haldi",
  "sangeet",
  "wedding",
  "reception",
  "speakeasy",
] as const;

/**
 * Invitation-only events. These are never carried by a tier, so a client may
 * only claim attendance at one if the couple has flagged this guest for it on
 * their own document. See the speakeasy guard in the transaction below.
 */
const INVITE_ONLY_EVENT_IDS: readonly string[] = ["speakeasy"];

const DIETARY = ["vegetarian", "non_vegetarian"] as const;

/**
 * The list shrank from six options to two (the couple asked for a plain
 * veg/non-veg split, with the specifics moved to the free-text notes field).
 * Rejecting an old value would make a returning guest's stored answer
 * unsubmittable, so retired ids are folded forward instead. Keep in sync with
 * RETIRED_DIETARY_IDS in src/content/wedding.ts.
 */
const RETIRED_DIETARY: Record<string, (typeof DIETARY)[number]> = {
  jain: "vegetarian",
  satvik: "vegetarian",
  vegan: "vegetarian",
  seafood_non_veg: "non_vegetarian",
  no_restriction: "non_vegetarian",
};

const TRANSPORT_MODES = ["airplane", "train", "self"] as const;
type TransportMode = (typeof TRANSPORT_MODES)[number];

const LOCALES = ["en", "hi", "kn", "or"] as const;

/**
 * Soft cap on party size. Open access means anyone with a link can submit, so
 * this is the main thing stopping one bogus entry from skewing headcounts.
 * Keep in sync with PARTY_SIZE_SOFT_CAP in src/content/wedding.ts.
 */
const PARTY_SIZE_SOFT_CAP = 15;

const MAX_NAME_LEN = 80;
const MAX_NOTE_LEN = 500;

/** "12703 Falaknuma" is longer than a flight number; both fit in 24. */
const MAX_SERVICE_LEN = 24;

interface PartyMember {
  /** Empty for anyone the guest chose not to name — only party[0] is required. */
  name: string;
  ageGroup: "adult" | "child";
  dietary: string;
}

interface Travel {
  arrivalOn: string | null;
  departureOn: string | null;
  mode: TransportMode | null;
  serviceNumber: string | null;
  wantsPickup: boolean;
}

interface SubmitRsvpPayload {
  tier?: unknown;
  language?: unknown;
  party?: unknown;
  perEventAttendance?: unknown;
  notes?: unknown;
  travel?: unknown;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new HttpsError("invalid-argument", message);
}

function cleanString(value: unknown, maxLen: number, field: string): string {
  assert(typeof value === "string", `${field} must be a string`);
  const trimmed = (value as string).trim();
  assert(trimmed.length > 0, `${field} must not be empty`);
  assert(
    trimmed.length <= maxLen,
    `${field} must be ${maxLen} characters or fewer`
  );
  return trimmed;
}

/**
 * `requireLeadName` is false when the guest is declining. Regrets skip the
 * party step entirely, so there is no name to give — and none is needed: a
 * decline is identified by the verified phone number on the token.
 */
function parseParty(value: unknown, requireLeadName: boolean): PartyMember[] {
  assert(Array.isArray(value), "party must be an array");
  const party = value as unknown[];

  assert(party.length >= 1, "party must include at least one person");
  assert(
    party.length <= PARTY_SIZE_SOFT_CAP,
    `party may not exceed ${PARTY_SIZE_SOFT_CAP} people`
  );

  return party.map((raw, i) => {
    assert(
      typeof raw === "object" && raw !== null,
      `party[${i}] must be an object`
    );
    const member = raw as Record<string, unknown>;

    const ageGroup = member.ageGroup;
    assert(
      ageGroup === "adult" || ageGroup === "child",
      `party[${i}].ageGroup must be "adult" or "child"`
    );

    assert(
      typeof member.dietary === "string",
      `party[${i}].dietary must be a string`
    );
    const dietary = normaliseDietary(
      member.dietary as string,
      `party[${i}].dietary`
    );

    // Only the person replying has to give a name — the UI offers the rest as
    // optional ("Names can come later"), so a blank is a valid answer here.
    const name = i === 0 && requireLeadName
      ? cleanString(member.name, MAX_NAME_LEN, "party[0].name")
      : optionalString(member.name, MAX_NAME_LEN, `party[${i}].name`) ?? "";

    return { name, ageGroup, dietary };
  });
}

function normaliseDietary(
  value: string,
  field: string
): (typeof DIETARY)[number] {
  if ((DIETARY as readonly string[]).includes(value)) {
    return value as (typeof DIETARY)[number];
  }
  const migrated = RETIRED_DIETARY[value];
  assert(migrated !== undefined, `${field} is not a recognised option`);
  return migrated;
}

/**
 * Travel details for step 4. Every field is optional by design — a guest
 * driving down from Brahmapur submits this step untouched.
 *
 * Dates are stored as the raw `YYYY-MM-DD` strings the client produced rather
 * than Timestamps: they are calendar days in India, and converting them
 * server-side would silently reinterpret them as UTC midnight, which is the
 * previous day locally.
 */
function parseTravel(value: unknown): Travel {
  if (value === undefined || value === null) return emptyTravel();

  assert(
    typeof value === "object" && !Array.isArray(value),
    "travel must be an object"
  );
  const input = value as Record<string, unknown>;

  const mode = parseTransportMode(input.mode);

  return {
    arrivalOn: optionalDate(input.arrivalOn, "travel.arrivalOn"),
    departureOn: optionalDate(input.departureOn, "travel.departureOn"),
    mode,
    // Driving yourself has no service number and needs no car, whatever the
    // client sent. The UI clears both on switching to "self"; this makes it
    // true regardless of which client sent the payload.
    serviceNumber:
      mode === "self"
        ? null
        : optionalString(
            input.serviceNumber,
            MAX_SERVICE_LEN,
            "travel.serviceNumber"
          ),
    wantsPickup: mode !== "self" && input.wantsPickup === true,
  };
}

function emptyTravel(): Travel {
  return {
    arrivalOn: null,
    departureOn: null,
    mode: null,
    serviceNumber: null,
    wantsPickup: false,
  };
}

function parseTransportMode(value: unknown): TransportMode | null {
  if (value === undefined || value === null || value === "") return null;
  assert(
    typeof value === "string" &&
      (TRANSPORT_MODES as readonly string[]).includes(value),
    "travel.mode is not a recognised mode of transport"
  );
  return value as TransportMode;
}

/** Accepts the `YYYY-MM-DD` shape a date input produces. */
function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === "") return null;
  assert(typeof value === "string", `${field} must be a string`);
  assert(
    /^\d{4}-\d{2}-\d{2}$/.test(value as string),
    `${field} must look like 2026-12-28`
  );
  return value as string;
}

function optionalString(
  value: unknown,
  maxLen: number,
  field: string
): string | null {
  if (value === undefined || value === null || value === "") return null;
  assert(typeof value === "string", `${field} must be a string`);
  const trimmed = (value as string).trim();
  if (trimmed.length === 0) return null;
  assert(
    trimmed.length <= maxLen,
    `${field} must be ${maxLen} characters or fewer`
  );
  return trimmed;
}

function parseAttendance(value: unknown): Record<string, boolean> {
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    "perEventAttendance must be an object"
  );
  const input = value as Record<string, unknown>;
  const out: Record<string, boolean> = {};

  for (const [key, attending] of Object.entries(input)) {
    assert(
      (EVENT_IDS as readonly string[]).includes(key),
      `perEventAttendance contains unknown event "${key}"`
    );
    assert(
      typeof attending === "boolean",
      `perEventAttendance.${key} must be a boolean`
    );
    out[key] = attending;
  }

  return out;
}

/**
 * The single write path for an RSVP.
 *
 * Two invariants live here and nowhere else:
 *  1. TIER IS IMMUTABLE. It is taken from the client only on first creation
 *     (the link they arrived on) and is never read from the client again. A
 *     guest cannot promote themselves from reception_only to full.
 *  2. PARTY SIZE IS CAPPED server-side. The client cap is UI feedback only.
 *  3. INVITE-ONLY EVENTS ARE NOT SELF-SERVE. A guest may only accept the
 *     speakeasy if the couple has already flagged them for it; the flag itself
 *     is written by the dashboard, never here.
 */
export const submitRsvp = onCall(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Verify your phone number before submitting an RSVP."
      );
    }

    const payload = (request.data ?? {}) as SubmitRsvpPayload;

    const claimedAttendance = parseAttendance(payload.perEventAttendance);
    const isAttending = Object.values(claimedAttendance).some(Boolean);

    const party = parseParty(payload.party, isAttending);
    const travel = parseTravel(payload.travel);

    const language = (LOCALES as readonly string[]).includes(
      payload.language as string
    )
      ? (payload.language as string)
      : "en";

    const notes =
      payload.notes === undefined ||
      payload.notes === null ||
      payload.notes === ""
        ? null
        : cleanString(payload.notes, MAX_NOTE_LEN, "notes");

    const ref = db.collection("rsvps").doc(uid);

    // A transaction because tier immutability is a read-then-write decision:
    // without it, two concurrent submissions could both see "no existing doc"
    // and race to set different tiers.
    const result = await db.runTransaction(async (tx) => {
      const existing = await tx.get(ref);

      let tier: Tier;
      if (existing.exists) {
        // Ignore whatever tier the client sent. This is the immutability rule.
        tier = existing.get("tier") as Tier;
      } else {
        const claimed = payload.tier;
        assert(
          typeof claimed === "string" &&
            (TIERS as readonly string[]).includes(claimed),
          "tier is not a recognised invite tier"
        );
        tier = claimed as Tier;
      }

      // The flag lives on the guest's own document and is only ever written by
      // the couple from the dashboard. Reading it inside the transaction is
      // what makes the check race-free: a client can't submit against a flag
      // that was revoked a moment ago.
      const speakeasyInvited = existing.get("speakeasyInvited") === true;
      const perEventAttendance = Object.fromEntries(
        Object.entries(claimedAttendance).filter(
          ([id]) => speakeasyInvited || !INVITE_ONLY_EVENT_IDS.includes(id)
        )
      );

      // Minted once and never rotated, so a QR the family has already printed
      // or forwarded keeps working after they edit their reply.
      const shareCode: string =
        (existing.get("shareCode") as string | undefined) ?? newShareCode();

      const base = {
        tier,
        language,
        party,
        partySize: party.length,
        perEventAttendance,
        travel,
        notes,
        submittedByPhone: request.auth?.token.phone_number ?? null,
        shareCode,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (existing.exists) {
        tx.update(ref, base);
      } else {
        tx.set(ref, { ...base, ownerUid: uid, createdAt: FieldValue.serverTimestamp() });
      }

      // The public mirror the QR points at. Written in the same transaction so
      // a scanned code can never show a reply the guest has since changed.
      tx.set(db.collection("invites").doc(shareCode), {
        ownerUid: uid,
        tier,
        // Names only. No phone number, no travel plans, no notes — a QR gets
        // forwarded, and everything in this document is effectively public.
        party: party.map(({ name, ageGroup }) => ({ name, ageGroup })),
        partySize: party.length,
        // Invite-only events are stripped: the whole point of the speakeasy is
        // that forwarding can't leak it.
        perEventAttendance: Object.fromEntries(
          Object.entries(perEventAttendance).filter(
            ([id]) => !INVITE_ONLY_EVENT_IDS.includes(id)
          )
        ),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { tier, created: !existing.exists, shareCode };
    });

    return {
      ok: true,
      tier: result.tier,
      created: result.created,
      shareCode: result.shareCode,
      partySize: party.length,
    };
  }
);

/**
 * Flags (or unflags) a guest for an invitation-only event.
 *
 * Admin-only, and deliberately the *only* way the flag is ever set: Firestore
 * rules refuse every client write to `rsvps`, so even the couple's own account
 * goes through here. The guest's app reveals the speakeasy off this flag, and
 * `submitRsvp` re-checks it before accepting attendance.
 */
export const setSpeakeasyInvite = onCall(
  { region: REGION, enforceAppCheck: false },
  async (request) => {
    if (request.auth?.token.role !== "admin") {
      throw new HttpsError(
        "permission-denied",
        "Only the couple and coordinators can change the guest list."
      );
    }

    const { ownerUid, invited } = (request.data ?? {}) as {
      ownerUid?: unknown;
      invited?: unknown;
    };
    assert(
      typeof ownerUid === "string" && ownerUid.length > 0,
      "ownerUid is required"
    );
    assert(typeof invited === "boolean", "invited must be a boolean");

    const ref = db.collection("rsvps").doc(ownerUid as string);
    const snap = await ref.get();
    assert(snap.exists, "That guest has not replied yet.");

    const update: Record<string, unknown> = {
      speakeasyInvited: invited,
      updatedAt: FieldValue.serverTimestamp(),
    };
    // Revoking has to take the acceptance with it, or the guest keeps a "yes"
    // on an event they can no longer see.
    if (!invited) update["perEventAttendance.speakeasy"] = FieldValue.delete();

    await ref.update(update);
    return { ok: true, ownerUid, invited };
  }
);

/**
 * The QR/share code. 10 chars from an unambiguous alphabet (no O/0, I/1) —
 * ~50 bits, which is far past guessable, and still readable if someone has to
 * type it off a printed card.
 */
function newShareCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}
