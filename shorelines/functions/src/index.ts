import { randomBytes, randomUUID } from "node:crypto";
import { initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

initializeApp();
const db = getFirestore();

// asia-south1 (Mumbai) — guests and the couple are in India; this is the
// nearest region and it must match getFunctions(app, region) on the client.
const REGION = "asia-south1";

// Set by the Functions emulator itself (firebase-tools), not something this
// repo configures. App Check is enforced everywhere except under the
// emulator, since there is no App Check emulator wired up (see
// firebase.json) and the client skips initializeAppCheck for the same
// reason — see the USE_EMULATOR branch in src/lib/firebase/client.ts.
const ENFORCE_APP_CHECK = process.env.FUNCTIONS_EMULATOR !== "true";

const TIERS = ["full", "wedding_only", "reception_only"] as const;
type Tier = (typeof TIERS)[number];

const EVENT_IDS = [
  "engagement",
  "mehendi",
  "haldi",
  "sangeet",
  "wedding",
  "reception",
] as const;

const DIETARY = ["vegetarian", "non_vegetarian"] as const;

const TRANSPORT_MODES = ["airplane", "train", "self"] as const;
type TransportMode = (typeof TRANSPORT_MODES)[number];

const LOCALES = ["en", "hi", "kn", "or"] as const;

/**
 * Staff roles. Nested, not overlapping — see src/lib/auth/roles.ts, which holds
 * the same table for the client, and roleRank() in firestore.rules.
 */
const STAFF_ROLES = ["coordinator", "couple", "admin"] as const;
type StaffRole = (typeof STAFF_ROLES)[number];

const RANK: Record<StaffRole, number> = {
  coordinator: 1,
  couple: 2,
  admin: 3,
};

function rankOf(role: unknown): number {
  return (STAFF_ROLES as readonly string[]).includes(role as string)
    ? RANK[role as StaffRole]
    : 0;
}

/**
 * Who gets which role, keyed by email address.
 *
 * A roster rather than a database collection, and a roster rather than a
 * one-off seeding script, because both alternatives have a bootstrap problem:
 * granting the *first* admin needs an admin. An env var has no such hole, it is
 * six lines for a six-person wedding, and it can't be edited by anything that
 * compromises the app — only by someone who can already deploy.
 *
 * Set STAFF_ROSTER as JSON: {"bride@example.com":"couple","dj@example.com":"coordinator"}
 * Locally that lives in functions/.env.local (emulator-only, never deployed).
 */
function staffRoster(): Record<string, StaffRole> {
  const raw = process.env.STAFF_ROSTER;
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Never throw here: a malformed roster must fail closed (nobody gets a
    // role) rather than take down every callable in the app.
    logger.error("STAFF_ROSTER is not valid JSON — no roles will be granted.");
    return {};
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    logger.error("STAFF_ROSTER must be a JSON object of email -> role.");
    return {};
  }

  const out: Record<string, StaffRole> = {};
  for (const [email, role] of Object.entries(parsed as Record<string, unknown>)) {
    if ((STAFF_ROLES as readonly string[]).includes(role as string)) {
      out[email.trim().toLowerCase()] = role as StaffRole;
    } else {
      logger.error(`STAFF_ROSTER: "${role}" is not a role; skipping ${email}.`);
    }
  }
  return out;
}

/**
 * The same roster, keyed by E.164 phone number instead of email — a second
 * way in for staff who'd rather not keep a password, added alongside the
 * email/Google path rather than instead of it (see `syncRole`).
 *
 * A phone number is its own verification: signing in still goes through a
 * real OTP, so there is no `phone_number_verified` gate to add here the way
 * there is for `email_verified` below. What a phone roster entry does *not*
 * get you is email's other property — the address can't be silently handed
 * to a new owner the way a mobile number can (a couple of months unused, in
 * India's telecom system, and it's reissued). Pull an entry the day that
 * number stops being that person's, not just whenever convenient — a stale
 * entry is a standing grant to whoever the carrier gives the number to next.
 *
 * Set STAFF_PHONE_ROSTER as JSON: {"+919876543210":"couple"}
 */
function staffPhoneRoster(): Record<string, StaffRole> {
  const raw = process.env.STAFF_PHONE_ROSTER;
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    logger.error("STAFF_PHONE_ROSTER is not valid JSON — no roles will be granted.");
    return {};
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    logger.error("STAFF_PHONE_ROSTER must be a JSON object of phone -> role.");
    return {};
  }

  const out: Record<string, StaffRole> = {};
  for (const [phone, role] of Object.entries(parsed as Record<string, unknown>)) {
    if (!(STAFF_ROLES as readonly string[]).includes(role as string)) {
      logger.error(`STAFF_PHONE_ROSTER: "${role}" is not a role; skipping ${phone}.`);
      continue;
    }
    const trimmed = phone.trim();
    if (!/^\+[1-9]\d{7,14}$/.test(trimmed)) {
      logger.error(`STAFF_PHONE_ROSTER: "${phone}" is not E.164; skipping.`);
      continue;
    }
    out[trimmed] = role as StaffRole;
  }
  return out;
}

/**
 * One identity string per person, whichever way they sign in:
 * `email:<lowercased>` or `phone:<e164>`. Both rosters above, the approval
 * collection below, and `staffPhotoAccess` all key off this same space, so a
 * coordinator who switches from a password to Google keeps everything.
 *
 * Email is preferred over phone when a token carries both, matching the branch
 * order in `syncRole`.
 */
function rosterIdentity(
  auth: { token: { email?: unknown; phone_number?: unknown } } | undefined
): string | null {
  const email = String(auth?.token.email ?? "").trim().toLowerCase();
  if (email) return `email:${email}`;
  const phone = String(auth?.token.phone_number ?? "").trim();
  if (phone) return `phone:${phone}`;
  return null;
}

/**
 * A coordinator has no photo access by default (see the tightened `photos/`
 * rule in storage.rules) — the couple opts specific people in, one at a time,
 * via `setStaffPhotoAccess`. Couple and admin never need an entry: they pass
 * by rank.
 */
async function hasPhotoAccess(identity: string | null): Promise<boolean> {
  if (!identity) return false;
  const snap = await db.collection("staffPhotoAccess").doc(identity).get();
  return snap.get("allowed") === true;
}

/**
 * ── The approval roster ──────────────────────────────────────────────────
 *
 * `staffAccess/{identity}` is the day-to-day way someone gets a role: they
 * sign in, ask for access, and an admin approves them with a role. The env
 * rosters above did not go away and are **not** redundant — they are the root
 * of trust:
 *
 *  - **Bootstrap.** Approving the first admin needs an admin. `STAFF_ROSTER`
 *    has no such hole, which is the whole reason a collection was originally
 *    rejected (see the comment on `staffRoster`). It now holds one entry
 *    instead of the whole team.
 *  - **Break-glass.** If an admin account is lost, or this collection is
 *    emptied by a bad migration, the env roster is still there and still
 *    grants. Recovering does not require the thing that broke.
 *  - **Precedence.** `syncRole` checks the env roster *first* and returns on a
 *    hit. Nothing writable from the dashboard can demote a deploy-time entry,
 *    so a compromised admin account cannot lock the real admin out.
 *
 * Nothing here is client-writable: the rules deny `staffAccess` outright and
 * these two callables are the only path in, same as `config/live`.
 */
const STAFF_ACCESS_STATUSES = ["pending", "approved", "denied"] as const;
type StaffAccessStatus = (typeof STAFF_ACCESS_STATUSES)[number];

/**
 * `/dashboard` is a normal URL on an open-access app, so the request queue is
 * something anyone with a verified address can add a row to. One row per
 * identity keeps that naturally bounded, and this caps the pathological case
 * where someone owns a lot of addresses — the admin gets a queue they can
 * still read, not ten thousand rows.
 */
const MAX_PENDING_STAFF_REQUESTS = 50;

interface StaffAccessRecord {
  status: StaffAccessStatus;
  role: StaffRole | null;
}

/**
 * This identity's row, normalised. Only `approved` grants — a pending or
 * denied row is the absence of a role, not a lesser one.
 */
async function readStaffAccess(
  identity: string
): Promise<StaffAccessRecord | null> {
  const snap = await db.collection("staffAccess").doc(identity).get();
  if (!snap.exists) return null;
  const status = snap.get("status");
  const role = snap.get("role");
  return {
    status: (STAFF_ACCESS_STATUSES as readonly string[]).includes(status as string)
      ? (status as StaffAccessStatus)
      : "pending",
    role: (STAFF_ROLES as readonly string[]).includes(role as string)
      ? (role as StaffRole)
      : null,
  };
}

/** Whether this identity is pinned by a deploy-time roster entry. */
function envRosterRole(identity: string): StaffRole | null {
  if (identity.startsWith("email:")) {
    return staffRoster()[identity.slice("email:".length)] ?? null;
  }
  if (identity.startsWith("phone:")) {
    return staffPhoneRoster()[identity.slice("phone:".length)] ?? null;
  }
  return null;
}

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

/** Recovery codes are 20 chars (see newRecoveryCode); a little headroom. */
const MAX_RECOVERY_CODE_LEN = 24;

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
  phone?: unknown;
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new HttpsError("invalid-argument", message);
}

/**
 * Firestore `Timestamp`s don't survive a callable's JSON round-trip as
 * anything useful, so anything shipped to a client goes out as ISO-8601.
 */
function isoOrNull(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return null;
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

/**
 * The list shrank from six options to two (the couple asked for a plain
 * veg/non-veg split, with the specifics moved to the free-text notes field).
 * A migration map used to fold the retired ids forward; it was removed with the
 * client-side one in src/content/wedding.ts, since no document outside a
 * throwaway emulator ever held them. These two must stay in sync — accepting an
 * id here that the client can't render sends a guest to a blank radio list.
 */
function normaliseDietary(
  value: string,
  field: string
): (typeof DIETARY)[number] {
  assert(
    (DIETARY as readonly string[]).includes(value),
    `${field} is not a recognised option`
  );
  return value as (typeof DIETARY)[number];
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
 */
export const submitRsvp = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError(
        "unauthenticated",
        "Sign in before submitting an RSVP."
      );
    }

    const payload = (request.data ?? {}) as SubmitRsvpPayload;

    const claimedAttendance = parseAttendance(payload.perEventAttendance);
    const isAttending = Object.values(claimedAttendance).some(Boolean);

    const party = parseParty(payload.party, isAttending);
    const travel = parseTravel(payload.travel);
    const phone = optionalPhone(payload.phone);

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

      // Minted once and never rotated, so a QR the family has already printed
      // or forwarded keeps working after they edit their reply.
      const shareCode: string =
        (existing.get("shareCode") as string | undefined) ?? newShareCode();

      // The way back in when the verified number itself is gone — a lost phone,
      // a dead SIM, someone who replied on a relative's handset. Never mirrored
      // into invites/{shareCode}, which is public.
      const recoveryCode: string =
        (existing.get("recoveryCode") as string | undefined) ??
        newRecoveryCode();

      const base = {
        tier,
        language,
        party,
        partySize: party.length,
        perEventAttendance: claimedAttendance,
        travel,
        notes,
        // Unverified — typed by the guest, kept only for the couple to call.
        submittedByPhone: phone,
        // Read off the token, never off the payload: this is the number the
        // reply is provably tied to, and the reason two replies can't share
        // one. Distinct from submittedByPhone, which the guest may change to
        // whoever should actually be rung.
        verifiedPhone: request.auth?.token.phone_number ?? null,
        shareCode,
        recoveryCode,
        updatedAt: FieldValue.serverTimestamp(),
      };

      if (existing.exists) {
        tx.update(ref, base);
      } else {
        // `flagged` only set on creation — an update must never touch it, or a
        // guest editing their own reply would silently clear a flag the couple
        // put there on purpose.
        tx.set(ref, {
          ...base,
          ownerUid: uid,
          flagged: false,
          createdAt: FieldValue.serverTimestamp(),
        });
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
        perEventAttendance: claimedAttendance,
        updatedAt: FieldValue.serverTimestamp(),
      });

      return { tier, created: !existing.exists, shareCode, recoveryCode };
    });

    return {
      ok: true,
      tier: result.tier,
      created: result.created,
      shareCode: result.shareCode,
      recoveryCode: result.recoveryCode,
      partySize: party.length,
    };
  }
);

/**
 * Format-checked only, never verified. This is the number the guest typed for
 * the couple to call — usually the one they verified, but editable, so it
 * proves nothing. Identity is `verifiedPhone`, read off the token. Optional: a
 * guest who clears it still gets to RSVP.
 */
function optionalPhone(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  assert(typeof value === "string", "phone must be a string");
  const trimmed = (value as string).trim();
  if (trimmed.length === 0) return null;
  assert(
    /^\+[1-9]\d{7,14}$/.test(trimmed),
    "phone is not a valid E.164 number"
  );
  return trimmed;
}

/**
 * Exchanges a guest's recovery code for a sign-in token.
 *
 * The fallback path, not the usual one: a guest normally gets back into their
 * reply by verifying the same number again, which resolves to the same uid.
 * This is for when that number can't be reached at all. The rules deny `list`
 * on `rsvps` to anyone but staff, so the lookup has to happen here, with the
 * Admin SDK, rather than as a client-side query.
 */
export const recoverRsvp = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const { code } = (request.data ?? {}) as { code?: unknown };
    const clean = cleanString(code, MAX_RECOVERY_CODE_LEN, "code");

    const snap = await db
      .collection("rsvps")
      .where("recoveryCode", "==", clean)
      .limit(1)
      .get();

    if (snap.empty) {
      throw new HttpsError("not-found", "That recovery link isn't valid.");
    }

    const uid = snap.docs[0].id;
    const token = await getAuth().createCustomToken(uid);
    return { token };
  }
);

/* -------------------------------------------------------------------------
 * Private events — privateEvents/{id}, revealed per guest.
 * ---------------------------------------------------------------------- */

/**
 * A gathering the couple adds after the app is built, shown only to the guests
 * they name one by one.
 *
 * These are runtime data, not config: which ones exist is the couple's to
 * decide on the day. There is nothing to RSVP for — the couple has already
 * settled who is coming, so the app's job is to tell those guests where and
 * when, not to ask them again.
 *
 * SECURITY. The reveal lives entirely on this side. Firestore rules let staff
 * read `privateEvents` and refuse everyone else, so a guest's only way to one
 * is `getMyPrivateEvents`, which reads the invite list off *their own* RSVP
 * document with the Admin SDK. There is no tier, no URL parameter and no client
 * flag anywhere in the path — the closest thing to a leak is a doc id, which
 * buys nothing without a matching entry on the caller's own document.
 */
const MAX_PRIVATE_EVENTS = 20;
const MAX_PRIVATE_EVENT_NOTE_LEN = 400;

interface PrivateEventPayload {
  id?: unknown;
  name?: unknown;
  startsAt?: unknown;
  endsAt?: unknown;
  venue?: unknown;
  mapsQuery?: unknown;
  dressCode?: unknown;
  note?: unknown;
}

/** Optional free text: absent, null or "" all mean "not set", never an error. */
function optionalText(value: unknown, maxLen: number, field: string): string {
  if (value === undefined || value === null || value === "") return "";
  return cleanString(value, maxLen, field);
}

/**
 * Creates a private event, or edits one when `id` names an existing document.
 *
 * Couple and up — not coordinators. Who gets asked is the couple's invitation
 * to extend, and a coordinator arranging cars has no business knowing the
 * gathering exists.
 */
export const savePrivateEvent = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    if (rankOf(request.auth?.token.role) < RANK.couple) {
      throw new HttpsError(
        "permission-denied",
        "Only the couple can add a private event."
      );
    }

    const payload = (request.data ?? {}) as PrivateEventPayload;

    const name = cleanString(payload.name, 80, "name");
    const startsAt = parseInstant(payload.startsAt, "startsAt");
    const endsAt = parseInstant(payload.endsAt, "endsAt");
    // Same reason `applyOverlay` rejects an inverted window as a pair: nothing
    // downstream fails on one, it just renders an event that ends before it
    // begins, which reads as a bug in the app rather than a typo in the form.
    assert(
      Date.parse(endsAt) >= Date.parse(startsAt),
      "The end time must not be before the start time."
    );

    const doc = {
      name,
      startsAt,
      endsAt,
      venue: optionalText(payload.venue, 120, "venue"),
      mapsQuery: optionalText(payload.mapsQuery, 200, "mapsQuery"),
      dressCode: optionalText(payload.dressCode, 80, "dressCode"),
      note: optionalText(payload.note, MAX_PRIVATE_EVENT_NOTE_LEN, "note"),
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: request.auth?.uid ?? null,
    };

    const collection = db.collection("privateEvents");

    if (typeof payload.id === "string" && payload.id.length > 0) {
      const ref = collection.doc(payload.id);
      const existing = await ref.get();
      assert(existing.exists, "That private event no longer exists.");
      await ref.update(doc);
      return { ok: true, id: ref.id };
    }

    const count = (await collection.count().get()).data().count;
    assert(
      count < MAX_PRIVATE_EVENTS,
      `You can have at most ${MAX_PRIVATE_EVENTS} private events.`
    );

    const ref = collection.doc();
    await ref.set({ ...doc, createdAt: FieldValue.serverTimestamp() });
    return { ok: true, id: ref.id };
  }
);

/**
 * Deletes a private event and every guest's invite to it in the same pass.
 *
 * The second half is the point. Leaving stale ids on guest documents would mean
 * `getMyPrivateEvents` quietly skipping a missing doc forever, and re-creating
 * an event with the same id would hand it back to a guest list nobody chose.
 */
export const deletePrivateEvent = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    if (rankOf(request.auth?.token.role) < RANK.couple) {
      throw new HttpsError(
        "permission-denied",
        "Only the couple can delete a private event."
      );
    }

    const { id } = (request.data ?? {}) as { id?: unknown };
    assert(typeof id === "string" && id.length > 0, "id is required");

    const invited = await db
      .collection("rsvps")
      .where("invitedPrivateEventIds", "array-contains", id as string)
      .get();

    const batch = db.batch();
    for (const guest of invited.docs) {
      batch.update(guest.ref, {
        invitedPrivateEventIds: FieldValue.arrayRemove(id as string),
      });
    }
    batch.delete(db.collection("privateEvents").doc(id as string));
    await batch.commit();

    return { ok: true, id, revoked: invited.size };
  }
);

/**
 * Adds or removes one guest's invite to one private event.
 *
 * The invite lives on the guest's own RSVP document rather than a member list
 * on the event, so the read that reveals it — `getMyPrivateEvents` — is a
 * single lookup of a document the caller already owns.
 */
export const setPrivateEventInvite = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    if (rankOf(request.auth?.token.role) < RANK.couple) {
      throw new HttpsError(
        "permission-denied",
        "Only the couple can change who's invited to a private event."
      );
    }

    const { eventId, ownerUid, invited } = (request.data ?? {}) as {
      eventId?: unknown;
      ownerUid?: unknown;
      invited?: unknown;
    };
    assert(
      typeof eventId === "string" && eventId.length > 0,
      "eventId is required"
    );
    assert(
      typeof ownerUid === "string" && ownerUid.length > 0,
      "ownerUid is required"
    );
    assert(typeof invited === "boolean", "invited must be a boolean");

    const event = await db
      .collection("privateEvents")
      .doc(eventId as string)
      .get();
    assert(event.exists, "That private event no longer exists.");

    const ref = db.collection("rsvps").doc(ownerUid as string);
    const snap = await ref.get();
    assert(snap.exists, "That guest has not replied yet.");

    await ref.update({
      invitedPrivateEventIds: invited
        ? FieldValue.arrayUnion(eventId as string)
        : FieldValue.arrayRemove(eventId as string),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, eventId, ownerUid, invited };
  }
);

/**
 * The guest's side: every private event this caller has been named for.
 *
 * Any signed-in guest may call it, and that is safe precisely because the
 * answer is derived from `rsvps/{their own uid}` — there is no parameter to
 * tamper with. A guest who has been named for nothing gets an empty list, which
 * is the same answer a guest who has not replied yet gets.
 */
export const getMyPrivateEvents = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }

    const guest = await db.collection("rsvps").doc(uid).get();
    const ids = guest.get("invitedPrivateEventIds");
    if (!Array.isArray(ids) || ids.length === 0) return { events: [] };

    const refs = ids
      .filter((id): id is string => typeof id === "string" && id.length > 0)
      .slice(0, MAX_PRIVATE_EVENTS)
      .map((id) => db.collection("privateEvents").doc(id));
    if (refs.length === 0) return { events: [] };

    const docs = await db.getAll(...refs);

    const events = docs
      .filter((doc) => doc.exists)
      .map((doc) => ({
        id: doc.id,
        name: doc.get("name") ?? "",
        startsAt: doc.get("startsAt") ?? "",
        endsAt: doc.get("endsAt") ?? "",
        venue: doc.get("venue") ?? "",
        mapsQuery: doc.get("mapsQuery") ?? "",
        dressCode: doc.get("dressCode") ?? "",
        note: doc.get("note") ?? "",
      }))
      .sort((a, b) => String(a.startsAt).localeCompare(String(b.startsAt)));

    return { events };
  }
);

/**
 * Marks a reply for the couple's attention (a suspicious headcount, a duplicate
 * submission from a different phone) without removing it. Firestore rules
 * refuse every client write to `rsvps`, so this callable is the only path even
 * for the couple's own account, same as `setPrivateEventInvite` above.
 *
 * `flagged` is only ever set at creation and never touched by `submitRsvp`'s
 * update path — see the comment there. That is what lets a flag survive a
 * guest going back in and editing their own reply.
 */
export const flagResponse = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    if (rankOf(request.auth?.token.role) < RANK.couple) {
      throw new HttpsError(
        "permission-denied",
        "Only the couple can flag a reply."
      );
    }

    const { ownerUid, flagged } = (request.data ?? {}) as {
      ownerUid?: unknown;
      flagged?: unknown;
    };
    assert(
      typeof ownerUid === "string" && ownerUid.length > 0,
      "ownerUid is required"
    );
    assert(typeof flagged === "boolean", "flagged must be a boolean");

    const ref = db.collection("rsvps").doc(ownerUid as string);
    const snap = await ref.get();
    assert(snap.exists, "That guest has not replied yet.");

    await ref.update({ flagged, updatedAt: FieldValue.serverTimestamp() });
    return { ok: true, ownerUid, flagged };
  }
);

/**
 * Removes a bogus reply — the abuse-mitigation backstop for open access
 * (anyone with a link can RSVP, so a rogue entry has to be removable). Deletes
 * the mirrored `invites/{shareCode}` doc in the same batch so a forwarded QR
 * for a deleted entry stops resolving instead of 404ing on a dangling read.
 *
 * The guest's Firebase Auth account is untouched: if they return with the same
 * phone number, `submitRsvp` sees no existing doc and creates a fresh one, same
 * as any first-time guest.
 */
export const deleteResponse = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    if (rankOf(request.auth?.token.role) < RANK.couple) {
      throw new HttpsError(
        "permission-denied",
        "Only the couple can delete a reply."
      );
    }

    const { ownerUid } = (request.data ?? {}) as { ownerUid?: unknown };
    assert(
      typeof ownerUid === "string" && ownerUid.length > 0,
      "ownerUid is required"
    );

    const ref = db.collection("rsvps").doc(ownerUid as string);
    const snap = await ref.get();
    assert(snap.exists, "That guest has not replied yet.");

    const shareCode = snap.get("shareCode") as string | undefined;
    const batch = db.batch();
    batch.delete(ref);
    if (shareCode) batch.delete(db.collection("invites").doc(shareCode));
    await batch.commit();

    logger.info("rsvp deleted", { uid: request.auth?.uid, ownerUid });
    return { ok: true, ownerUid };
  }
);

/**
 * Reconciles the signed-in staff account's `role` custom claim with the roster.
 *
 * Called by the dashboard on every sign-in and on every app load. It both
 * grants and revokes: an address removed from the roster loses its claim the
 * next time that person opens the dashboard.
 *
 * The email-verified check is the load-bearing line. Without it, anyone who
 * knows the bride's email address could register it with a password of their
 * own choosing before she does, and inherit `couple` — which is read access to
 * every guest's phone number and to the private memories inbox. A password
 * account has to click a link in that mailbox first; a Google account arrives
 * verified by Google.
 *
 * Two authorities, checked in this order:
 *
 *   1. the deploy-time env roster — one break-glass admin, changeable only by
 *      someone who can already deploy; and
 *   2. `staffAccess/{identity}`, where an admin has approved a request.
 *
 * The order is the safety property. An env-roster entry can never be demoted
 * or removed by anything reachable from the dashboard, so a compromised admin
 * account cannot lock the real admin out — see the comment on the collection.
 *
 * `email_verified` applies to both authorities equally: the approval path
 * cannot be used to slip a role onto an unverified address.
 */
export const syncRole = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, secrets: ["STAFF_ROSTER", "STAFF_PHONE_ROSTER"] },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }

    const email = String(auth.token.email ?? "").trim().toLowerCase();
    const phone = String(auth.token.phone_number ?? "").trim();
    const current = (auth.token.role as string | undefined) ?? null;

    // A phone-auth staff sign-in has already proven itself via OTP — that's
    // the same bar `email_verified` clears below, so there is no separate
    // gate here. Checked before email so a staff member who signed in with
    // phone isn't sent down the email branch just because their Google
    // account (if any) happens to also carry an address.
    if (phone) {
      const identity = `phone:${phone}`;
      const pinned = staffPhoneRoster()[phone] ?? null;
      const record = pinned ? null : await readStaffAccess(identity);
      const assigned = pinned ?? (record?.status === "approved" ? record.role : null);
      const access: StaffAccessStatus | null = pinned ? "approved" : record?.status ?? null;
      const photoAccess = assigned
        ? rankOf(assigned) >= RANK.couple || (await hasPhotoAccess(identity))
        : false;
      if (assigned === current) return { role: assigned, changed: false, photoAccess, access };

      await getAuth().setCustomUserClaims(auth.uid, assigned ? { role: assigned } : {});

      logger.info("staff role updated (phone)", {
        uid: auth.uid,
        phone,
        from: current,
        to: assigned,
        source: pinned ? "roster" : "approval",
      });

      return { role: assigned, changed: true, photoAccess, access };
    }

    // A phone-auth guest reaching this endpoint has no email and simply gets
    // nothing back — not an error, since the dashboard is a normal URL and a
    // curious guest may well open it.
    if (!email) return { role: null, changed: false, photoAccess: false, access: null };

    if (auth.token.email_verified !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Confirm your email address first — check your inbox for the link."
      );
    }

    const identity = `email:${email}`;
    const pinned = staffRoster()[email] ?? null;
    const record = pinned ? null : await readStaffAccess(identity);
    const assigned = pinned ?? (record?.status === "approved" ? record.role : null);
    // `access` is how the gate tells "asked, waiting" apart from "never asked"
    // — the client can't read `staffAccess` itself, the rules deny it.
    const access: StaffAccessStatus | null = pinned ? "approved" : record?.status ?? null;
    const photoAccess = assigned
      ? rankOf(assigned) >= RANK.couple || (await hasPhotoAccess(identity))
      : false;

    if (assigned === current) return { role: assigned, changed: false, photoAccess, access };

    // Replacing the whole claim object, not merging: dropping off the roster
    // has to actually remove the role, not leave a stale one behind.
    await getAuth().setCustomUserClaims(auth.uid, assigned ? { role: assigned } : {});

    logger.info("staff role updated", {
      uid: auth.uid,
      email,
      from: current,
      to: assigned,
      source: pinned ? "roster" : "approval",
    });

    // The caller's existing ID token still carries the old claim — the client
    // has to force-refresh before Firestore rules will see this.
    return { role: assigned, changed: true, photoAccess, access };
  }
);

/**
 * Everything the "Staff access" panel renders: the deploy-time env roster (read
 * only — changing it needs deploy access, on purpose) and the `staffAccess`
 * request queue, which is the part an admin actually acts on via
 * `decideStaffAccess`.
 *
 * Timestamps go out as ISO strings rather than Firestore `Timestamp` objects,
 * which don't survive the callable's JSON serialisation intact.
 */
export const getStaffRoster = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, secrets: ["STAFF_ROSTER", "STAFF_PHONE_ROSTER"] },
  async (request) => {
    if (rankOf(request.auth?.token.role) < RANK.admin) {
      throw new HttpsError(
        "permission-denied",
        "Only an admin can view the staff roster."
      );
    }

    const email = Object.entries(staffRoster()).map(([email, role]) => ({
      email,
      role,
    }));
    const phone = Object.entries(staffPhoneRoster()).map(([phone, role]) => ({
      phone,
      role,
    }));

    const photoAccessSnap = await db.collection("staffPhotoAccess").get();
    const photoAccess: Record<string, boolean> = {};
    for (const doc of photoAccessSnap.docs) {
      photoAccess[doc.id] = doc.get("allowed") === true;
    }

    const requestsSnap = await db.collection("staffAccess").get();
    const requests = requestsSnap.docs
      .map((doc) => ({
        identity: doc.id,
        kind: doc.get("kind") === "phone" ? "phone" : "email",
        value: String(doc.get("value") ?? ""),
        status: String(doc.get("status") ?? "pending"),
        role: (STAFF_ROLES as readonly string[]).includes(doc.get("role"))
          ? (doc.get("role") as StaffRole)
          : null,
        displayName: doc.get("displayName") ?? null,
        requestedAt: isoOrNull(doc.get("requestedAt")),
        decidedAt: isoOrNull(doc.get("decidedAt")),
        decidedByIdentity: doc.get("decidedByIdentity") ?? null,
      }))
      // Pending first — that's the queue an admin came here to clear.
      .sort((a, b) => {
        if ((a.status === "pending") !== (b.status === "pending")) {
          return a.status === "pending" ? -1 : 1;
        }
        return (b.requestedAt ?? "").localeCompare(a.requestedAt ?? "");
      });

    return { email, phone, photoAccess, requests };
  }
);

/**
 * "I'm staff, please let me in." Creates or refreshes this identity's row in
 * `staffAccess` with `status: "pending"`; grants nothing by itself.
 *
 * Anyone signed in can call this — that's the point, it's how someone with no
 * role asks for one, and `/dashboard` is a normal URL on an open-access app.
 * Three things keep that from being a spam surface: one row per identity (a
 * re-request overwrites, it never stacks), a verified email or a completed
 * OTP to have an identity at all, and a hard cap on how many pending rows can
 * exist at once.
 */
export const requestStaffAccess = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, secrets: ["STAFF_ROSTER", "STAFF_PHONE_ROSTER"] },
  async (request) => {
    const auth = request.auth;
    if (!auth) {
      throw new HttpsError("unauthenticated", "Sign in first.");
    }

    const email = String(auth.token.email ?? "").trim().toLowerCase();
    const phone = String(auth.token.phone_number ?? "").trim();

    // Same gate as `syncRole`, for the same reason: an unverified address is
    // not evidence of anything, so it can't be allowed to open a request an
    // admin might approve on the strength of the address alone.
    if (email && auth.token.email_verified !== true) {
      throw new HttpsError(
        "failed-precondition",
        "Confirm your email address first — check your inbox for the link."
      );
    }

    const identity = rosterIdentity(auth);
    if (!identity) {
      throw new HttpsError(
        "failed-precondition",
        "Sign in with an email address or a phone number first."
      );
    }

    // Already pinned by the env roster: a row here would never be read.
    if (envRosterRole(identity)) {
      return { status: "approved" as const, identity };
    }

    const kind = email ? "email" : "phone";
    const value = email || phone;
    const ref = db.collection("staffAccess").doc(identity);
    const existing = await ref.get();

    if (existing.get("status") === "approved") {
      return { status: "approved" as const, identity };
    }

    if (!existing.exists) {
      const pending = await db
        .collection("staffAccess")
        .where("status", "==", "pending")
        .limit(MAX_PENDING_STAFF_REQUESTS)
        .get();
      if (pending.size >= MAX_PENDING_STAFF_REQUESTS) {
        throw new HttpsError(
          "resource-exhausted",
          "There are too many access requests waiting. Ask an admin to clear the queue."
        );
      }
    }

    const name = String(auth.token.name ?? "").trim().slice(0, 80);

    // Full overwrite, not a merge: a previously denied row goes back to
    // pending cleanly, with the old decision gone rather than half-present.
    await ref.set({
      kind,
      value,
      status: "pending",
      role: null,
      displayName: name || null,
      uid: auth.uid,
      requestedAt: FieldValue.serverTimestamp(),
      decidedAt: null,
      decidedBy: null,
      decidedByIdentity: null,
    });

    logger.info("staff access requested", { uid: auth.uid, identity });
    return { status: "pending" as const, identity };
  }
);

/**
 * An admin approves a request with a role, or denies it with `role: null`.
 * The only write path onto a `staffAccess` decision — the rules deny the
 * collection outright.
 *
 * Two refusals matter more than they look:
 *
 *  - **Env-roster identities.** Writing a row for one would be accepted and
 *    then silently never read, since `syncRole` returns on the roster hit. A
 *    refusal is better than a decision that appears to apply and doesn't.
 *  - **Yourself.** Otherwise the only admin can deny themselves and lock
 *    everyone out of the one endpoint that could undo it.
 *
 * The claim is applied here rather than waiting for the person's next
 * `syncRole`, so an approval takes effect while the admin is still watching —
 * but only for a verified account, so this can't be a way around that gate.
 */
export const decideStaffAccess = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK, secrets: ["STAFF_ROSTER", "STAFF_PHONE_ROSTER"] },
  async (request) => {
    if (rankOf(request.auth?.token.role) < RANK.admin) {
      throw new HttpsError(
        "permission-denied",
        "Only an admin can decide staff access."
      );
    }

    const { identity, role } = (request.data ?? {}) as {
      identity?: unknown;
      role?: unknown;
    };
    assert(
      typeof identity === "string" && /^(email|phone):.+$/.test(identity),
      "identity must be an email: or phone: key"
    );
    assert(
      role === null ||
        (typeof role === "string" && (STAFF_ROLES as readonly string[]).includes(role)),
      "role must be a staff role or null"
    );
    const decided = (role as StaffRole | null) ?? null;

    const callerIdentity = rosterIdentity(request.auth);
    if (identity === callerIdentity) {
      throw new HttpsError(
        "failed-precondition",
        "You can't change your own access."
      );
    }
    if (envRosterRole(identity)) {
      throw new HttpsError(
        "failed-precondition",
        "That person is pinned by the deploy-time roster and can only be changed by redeploying."
      );
    }

    const ref = db.collection("staffAccess").doc(identity);
    const snap = await ref.get();
    if (!snap.exists) {
      throw new HttpsError("not-found", "No such access request.");
    }

    await ref.update({
      status: decided ? "approved" : "denied",
      role: decided,
      decidedAt: FieldValue.serverTimestamp(),
      decidedBy: request.auth?.uid ?? null,
      decidedByIdentity: callerIdentity,
    });

    // Apply (or clear) the claim now. Best-effort: the row is the authority
    // and `syncRole` reconciles from it on their next load, so a missing Auth
    // account — approved before they've ever signed in — isn't an error.
    const value = identity.slice(identity.indexOf(":") + 1);
    let applied = false;
    try {
      const user =
        identity.startsWith("email:")
          ? await getAuth().getUserByEmail(value)
          : await getAuth().getUserByPhoneNumber(value);
      const verified = identity.startsWith("phone:") || user.emailVerified;
      if (verified || !decided) {
        await getAuth().setCustomUserClaims(user.uid, decided ? { role: decided } : {});
        applied = true;
      }
    } catch (error) {
      logger.info("staff access decided, claim not applied yet", { identity, error });
    }

    const log = decided === "admin" ? logger.warn : logger.info;
    log("staff access decided", {
      by: request.auth?.uid,
      byIdentity: callerIdentity,
      identity,
      role: decided,
      applied,
    });

    return { ok: true, identity, role: decided, applied };
  }
);

/**
 * Grants or revokes one specific coordinator's photo-view access. Admin-only,
 * same as `setAlbumVisibility` — this shapes who gets access rather than just
 * using it. Couple and admin identities never need an entry here since they
 * pass the rank check in `listEventPhotos` regardless; writing or deleting a
 * grant for one of them would be accepted but is simply never read.
 */
export const setStaffPhotoAccess = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    if (rankOf(request.auth?.token.role) < RANK.admin) {
      throw new HttpsError(
        "permission-denied",
        "Only an admin can change photo access."
      );
    }

    const { kind, value, allowed } = (request.data ?? {}) as {
      kind?: unknown;
      value?: unknown;
      allowed?: unknown;
    };
    assert(kind === "email" || kind === "phone", 'kind must be "email" or "phone"');
    assert(typeof value === "string" && value.trim().length > 0, "value is required");
    assert(typeof allowed === "boolean", "allowed must be a boolean");

    const normalised = kind === "email" ? value.trim().toLowerCase() : value.trim();
    if (kind === "phone") {
      assert(
        /^\+[1-9]\d{7,14}$/.test(normalised),
        "value is not a valid E.164 phone number"
      );
    }
    const identity = `${kind}:${normalised}`;
    const ref = db.collection("staffPhotoAccess").doc(identity);

    if (allowed) {
      await ref.set({
        allowed: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth?.uid ?? null,
      });
    } else {
      await ref.delete();
    }

    return { ok: true, identity, allowed };
  }
);

/**
 * Server-side photo listing so a granted coordinator can browse an event's
 * uploads without direct Storage SDK access — storage.rules' `photos/` read
 * is couple-rank-only, so this callable (Admin SDK, bypasses those rules) is
 * the only way a granted coordinator sees them. Couple/admin call this too,
 * for one consistent code path on the client, even though the rules would
 * also let them read directly.
 */
export const listEventPhotos = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const rank = rankOf(request.auth?.token.role);
    if (rank < RANK.coordinator) {
      throw new HttpsError(
        "permission-denied",
        "You need a staff account to view photos."
      );
    }
    if (rank < RANK.couple) {
      const identity = rosterIdentity(request.auth);
      if (!(await hasPhotoAccess(identity))) {
        throw new HttpsError(
          "permission-denied",
          "You don't have access to this event's photos."
        );
      }
    }

    const { eventId } = (request.data ?? {}) as { eventId?: unknown };
    assert(
      typeof eventId === "string" &&
        Object.prototype.hasOwnProperty.call(EVENT_START_TIMES, eventId),
      "eventId is not a recognised event"
    );

    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ prefix: `photos/${eventId}/` });

    // Firebase download-token URLs, not getSignedUrl(): signing needs a
    // service-account private key or IAM signBlob permission on the
    // function's own runtime service account, neither of which exists
    // against the Storage emulator and neither of which Cloud Functions
    // Gen2 grants by default — getSignedUrl() throws SigningError in both
    // places. A download token is plain Storage object metadata, served by
    // the same /v0/b/.../o/... REST endpoint the client SDK's
    // getDownloadURL() uses, so it needs no signing and works identically
    // against the emulator and in production.
    const emulatorHost = process.env.STORAGE_EMULATOR_HOST;
    const base = emulatorHost
      ? `${emulatorHost.replace(/\/$/, "")}/v0`
      : "https://firebasestorage.googleapis.com/v0";

    const photos = await Promise.all(
      files.map(async (file) => {
        const [metadata] = await file.getMetadata();
        let token = metadata.metadata?.firebaseStorageDownloadTokens
          ?.toString()
          .split(",")[0];
        if (!token) {
          token = randomUUID();
          await file.setMetadata({
            metadata: { firebaseStorageDownloadTokens: token },
          });
        }
        const url = `${base}/b/${encodeURIComponent(bucket.name)}/o/${encodeURIComponent(file.name)}?alt=media&token=${token}`;
        return {
          fullPath: file.name,
          name: file.name.split("/").pop() ?? file.name,
          url,
        };
      })
    );

    return { photos };
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

/**
 * The recovery code. Longer than the share code (20 vs 10 chars, same
 * unambiguous alphabet) because this one grants sign-in — recoverRsvp mints a
 * custom token for whoever holds it — rather than a read-only view.
 */
function newRecoveryCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(20);
  let out = "";
  for (const byte of bytes) out += alphabet[byte % alphabet.length];
  return out;
}

/* -------------------------------------------------------------------------
 * v2 guest features: chat, memories, polls, song requests, photo albums.
 * ---------------------------------------------------------------------- */

/**
 * Fallback event windows, duplicated from wedding.config.ts because Functions
 * is a separate npm package with no import path into src/content — same
 * precedent as RANK/STAFF_ROLES above, which duplicate src/lib/auth/roles.ts
 * for the same reason. Overridden by config/live's events.{eventId} when the
 * couple has moved a time, same overlay-first-then-literal order the client
 * reads through. A schedule change in wedding.config.ts needs a matching edit
 * here or the song-request cutoff silently desyncs from what guests see.
 */
const EVENT_START_TIMES: Record<string, { startsAt: string; endsAt: string }> = {
  engagement: { startsAt: "2026-12-28T17:00:00+05:30", endsAt: "2026-12-28T18:30:00+05:30" },
  mehendi: { startsAt: "2026-12-28T19:00:00+05:30", endsAt: "2026-12-28T21:00:00+05:30" },
  haldi: { startsAt: "2026-12-29T10:00:00+05:30", endsAt: "2026-12-29T14:00:00+05:30" },
  sangeet: { startsAt: "2026-12-29T18:00:00+05:30", endsAt: "2026-12-29T21:00:00+05:30" },
  wedding: { startsAt: "2026-12-30T10:00:00+05:30", endsAt: "2026-12-30T14:00:00+05:30" },
  reception: { startsAt: "2026-12-30T18:30:00+05:30", endsAt: "2026-12-30T21:00:00+05:30" },
};

const CHAT_COOLDOWN_MS = 3_000;
const MAX_CHAT_LEN = 500;
const MAX_SONG_LEN = 120;
const MAX_ARTIST_LEN = 120;
const SONG_REQUEST_CUTOFF_MS = 60 * 60 * 1000;
const ALBUM_VISIBILITIES = ["shared", "private"] as const;

function isValidRoomId(roomId: string): boolean {
  return roomId === "group" || /^dm_[A-Za-z0-9]+$/.test(roomId);
}

/**
 * Spam is the one new risk a guest write surface introduces: chat is the first
 * genuinely high-frequency write path in the app — everything else is one RSVP,
 * one vote, one song request, so the shape of the write is its own limit. A
 * verified number raises the cost of a throwaway identity but doesn't cap how
 * fast the one identity a guest already has can post.
 * A guest under cooldown is rejected before the message is written; staff are
 * exempt, since a rostered account isn't the thing this is guarding against.
 */
export const sendChatMessage = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in before sending a message.");
    }

    const rank = rankOf(request.auth?.token.role);
    const isStaffCaller = rank >= RANK.coordinator;

    const { roomId, text, name } = (request.data ?? {}) as {
      roomId?: unknown;
      text?: unknown;
      name?: unknown;
    };
    assert(
      typeof roomId === "string" && isValidRoomId(roomId),
      "roomId is not recognised"
    );

    // A guest may address the group room or their own concierge thread only —
    // never another guest's dm_ room. Staff may reply into any thread.
    if (!isStaffCaller) {
      assert(
        roomId === "group" || roomId === `dm_${uid}`,
        "You may only message the group room or your own concierge thread."
      );
    }

    const cleanText = cleanString(text, MAX_CHAT_LEN, "text");
    const displayName = isStaffCaller
      ? cleanString(name, MAX_NAME_LEN, "name")
      : optionalString(name, MAX_NAME_LEN, "name") ?? "Guest";

    if (!isStaffCaller) {
      const cooldownRef = db.collection("chatCooldowns").doc(uid);
      const cooldownSnap = await cooldownRef.get();
      const lastSentAt = cooldownSnap.get("lastSentAt") as
        | FirebaseFirestore.Timestamp
        | undefined;
      if (lastSentAt && Date.now() - lastSentAt.toMillis() < CHAT_COOLDOWN_MS) {
        throw new HttpsError(
          "resource-exhausted",
          "Slow down a little before sending another message."
        );
      }
      await cooldownRef.set({ lastSentAt: FieldValue.serverTimestamp() });
    }

    const ref = await db
      .collection("chats")
      .doc(roomId)
      .collection("messages")
      .add({
        ownerUid: uid,
        authorRole: isStaffCaller ? "staff" : "guest",
        name: displayName,
        text: cleanText,
        createdAt: FieldValue.serverTimestamp(),
        flagged: false,
      });

    return { ok: true, id: ref.id };
  }
);

/**
 * Flag, unflag or delete a chat message. Coordinator and up — the same rank
 * that reads the concierge threads, since moderating a room and staffing it
 * are the same job.
 */
export const moderateChatMessage = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    if (rankOf(request.auth?.token.role) < RANK.coordinator) {
      throw new HttpsError(
        "permission-denied",
        "You need a staff account to moderate chat."
      );
    }

    const { roomId, messageId, action } = (request.data ?? {}) as {
      roomId?: unknown;
      messageId?: unknown;
      action?: unknown;
    };
    assert(typeof roomId === "string" && roomId.length > 0, "roomId is required");
    assert(
      typeof messageId === "string" && messageId.length > 0,
      "messageId is required"
    );
    assert(
      action === "flag" || action === "unflag" || action === "delete",
      'action must be "flag", "unflag" or "delete"'
    );

    const ref = db
      .collection("chats")
      .doc(roomId)
      .collection("messages")
      .doc(messageId);
    const snap = await ref.get();
    assert(snap.exists, "That message doesn't exist.");

    if (action === "delete") {
      await ref.delete();
    } else {
      await ref.update({ flagged: action === "flag" });
    }

    return { ok: true, roomId, messageId, action };
  }
);

/**
 * One vote per guest per poll, enforced without a transaction: the vote doc's
 * id is deterministically `${pollId}_${ownerUid}`, and `.create()` throws
 * `already-exists` if it's already there — the same trick a transaction would
 * buy, for free, because the id collision IS the invariant.
 */
export const castVote = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in before voting.");
    }

    const { pollId, optionId } = (request.data ?? {}) as {
      pollId?: unknown;
      optionId?: unknown;
    };
    assert(typeof pollId === "string" && pollId.length > 0, "pollId is required");
    assert(
      typeof optionId === "string" && optionId.length > 0,
      "optionId is required"
    );

    const pollSnap = await db.collection("polls").doc(pollId).get();
    assert(pollSnap.exists, "That poll doesn't exist.");
    assert(pollSnap.get("status") === "open", "That poll is closed.");

    const options =
      (pollSnap.get("options") as { id: string }[] | undefined) ?? [];
    assert(
      options.some((option) => option.id === optionId),
      "That's not an option on this poll."
    );

    try {
      await db
        .collection("pollVotes")
        .doc(`${pollId}_${uid}`)
        .create({
          pollId,
          optionId,
          ownerUid: uid,
          createdAt: FieldValue.serverTimestamp(),
        });
    } catch {
      throw new HttpsError("already-exists", "You've already voted on this poll.");
    }

    return { ok: true };
  }
);

/**
 * A DJ song request. Cutoff is 1 hour before the event's real, possibly
 * overlay-adjusted start time — read the same overlay-first-then-literal way
 * the client does, never trusting a client-sent time — unless the couple/admin
 * has set config/live.songRequestsOverride, which keeps every event's queue
 * open regardless of the clock.
 */
export const submitSongRequest = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const uid = request.auth?.uid;
    if (!uid) {
      throw new HttpsError("unauthenticated", "Sign in before requesting a song.");
    }

    const { eventId, title, artist, note } = (request.data ?? {}) as {
      eventId?: unknown;
      title?: unknown;
      artist?: unknown;
      note?: unknown;
    };
    assert(
      typeof eventId === "string" &&
        Object.prototype.hasOwnProperty.call(EVENT_START_TIMES, eventId),
      "eventId is not a recognised event"
    );

    const rsvpSnap = await db.collection("rsvps").doc(uid).get();
    assert(
      rsvpSnap.exists && rsvpSnap.get(`perEventAttendance.${eventId}`) === true,
      "You're not attending that event."
    );

    const overlaySnap = await db.collection("config").doc("live").get();
    const overrideStart = overlaySnap.get(`events.${eventId}.startsAt`) as
      | string
      | undefined;
    const startsAtMs = Date.parse(
      overrideStart ?? EVENT_START_TIMES[eventId as string].startsAt
    );

    const deadlineLifted = overlaySnap.get("songRequestsOverride") === true;
    if (!deadlineLifted) {
      assert(
        Date.now() < startsAtMs - SONG_REQUEST_CUTOFF_MS,
        "Song requests for this event have closed."
      );
    }

    const ref = await db.collection("songRequests").add({
      eventId,
      ownerUid: uid,
      title: cleanString(title, MAX_SONG_LEN, "title"),
      artist: optionalString(artist, MAX_ARTIST_LEN, "artist"),
      note: optionalString(note, MAX_NOTE_LEN, "note"),
      createdAt: FieldValue.serverTimestamp(),
    });

    return { ok: true, id: ref.id };
  }
);

/**
 * Per-event shared/private toggle for uploaded photos. Admin-only
 * (`manageAlbums`) — the couple decides that per role in
 * src/lib/auth/roles.ts, kept in sync here.
 */
export const setAlbumVisibility = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    if (rankOf(request.auth?.token.role) < RANK.admin) {
      throw new HttpsError(
        "permission-denied",
        "Only an admin can change album visibility."
      );
    }

    const { eventId, visibility } = (request.data ?? {}) as {
      eventId?: unknown;
      visibility?: unknown;
    };
    assert(
      typeof eventId === "string" &&
        Object.prototype.hasOwnProperty.call(EVENT_START_TIMES, eventId),
      "eventId is not a recognised event"
    );
    assert(
      typeof visibility === "string" &&
        (ALBUM_VISIBILITIES as readonly string[]).includes(visibility),
      'visibility must be "shared" or "private"'
    );

    await db
      .collection("albumSettings")
      .doc(eventId)
      .set({
        visibility,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: request.auth?.uid ?? null,
      });

    return { ok: true, eventId, visibility };
  }
);

/* -------------------------------------------------------------------------
 * The runtime overlay — config/live.
 * ---------------------------------------------------------------------- */

/**
 * ISO 8601 instant with an explicit offset, e.g. 2026-12-29T11:28:00+05:30.
 *
 * `Date.parse` alone is far too permissive — it accepts "December 29" and
 * resolves it against the current year in the *server's* zone, so a half-typed
 * value would be stored as a real timestamp in the wrong place instead of being
 * rejected. The shape has to be checked before the value is.
 */
const INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/;

const MAX_SCHEDULE_KEYS = 40;
const MAX_CONTACTS = 20;

function parseInstant(value: unknown, field: string): string {
  assert(typeof value === "string", `${field} must be a string`);
  assert(INSTANT.test(value as string), `${field} must be an ISO 8601 instant`);
  assert(!Number.isNaN(Date.parse(value as string)), `${field} is not a real date`);
  return value as string;
}

/**
 * Writes the couple's runtime edits to `config/live`.
 *
 * This is the answer to "the Haldi moved to 11 — do we redeploy?". Event and
 * meal times and the emergency contact list live in one Firestore document that
 * the app merges over its compiled-in config on every render, so a change here
 * is live inside a minute with no build, no deploy and no repo access.
 *
 * Two capabilities, checked per section rather than once at the top, because
 * they genuinely differ: moving a ceremony is the couple's call (it reshapes
 * every guest's schedule and, through mealsForEvents, which meals they see),
 * while a coordinator is exactly the person who should be able to correct the
 * hotel's front-desk number at 11pm. A coordinator sending both sections gets
 * the contacts written and the times refused — as one error, before anything is
 * written, so a partial success is impossible.
 *
 * Firestore rules deny every client write to this document, so this callable is
 * the only way in. That is not belt-and-braces: an inverted start/end pair does
 * not fail anywhere downstream, it silently empties a guest's meal list, and a
 * check that only exists in a dashboard form is a check a `curl` skips.
 *
 * Sending `null` for an event or schedule entry clears that override and lets
 * the value compiled into the build show through again — the "put it back how
 * it was" affordance, which matters more than it sounds when someone has just
 * mistyped a time an hour before an event.
 */
export const updateWeddingLive = onCall(
  { region: REGION, enforceAppCheck: ENFORCE_APP_CHECK },
  async (request) => {
    const rank = rankOf(request.auth?.token.role);
    assertSignedInStaff(rank);

    const { events, schedule, emergencyContacts, songRequestsOverride } =
      (request.data ?? {}) as {
        events?: unknown;
        schedule?: unknown;
        emergencyContacts?: unknown;
        songRequestsOverride?: unknown;
      };

    const touchesTimes = events !== undefined || schedule !== undefined;
    const touchesContacts = emergencyContacts !== undefined;
    const touchesSongOverride = songRequestsOverride !== undefined;
    assert(
      touchesTimes || touchesContacts || touchesSongOverride,
      "Nothing to update."
    );

    // editSchedule = couple (2). Keep in sync with CAPABILITIES in
    // src/lib/auth/roles.ts.
    if (touchesTimes && rank < RANK.couple) {
      throw new HttpsError(
        "permission-denied",
        "Only the couple can change the schedule."
      );
    }

    // overrideSongDeadline = admin (3). Keep in sync with CAPABILITIES in
    // src/lib/auth/roles.ts.
    if (touchesSongOverride && rank < RANK.admin) {
      throw new HttpsError(
        "permission-denied",
        "Only an admin can change the song-request cutoff."
      );
    }

    const update: Record<string, unknown> = {
      updatedAt: new Date().toISOString(),
      updatedBy: request.auth?.uid ?? null,
    };

    /*
     * Nested maps, NOT dotted keys.
     *
     * `set(…, {merge: true})` reads a string key as a field *name*, dots and
     * all — so `update["events.haldi"] = …` writes a top-level field literally
     * called "events.haldi" and the reader's `overlay.events` stays undefined.
     * It looks right in the console and silently overrides nothing. Only
     * `update()` reads dots as a path, and `update()` throws when the document
     * doesn't exist, which it doesn't until the first save.
     *
     * `merge: true` merges maps recursively, so writing `{events: {haldi: …}}`
     * still leaves `events.mehendi` alone — two people editing different rows
     * don't clobber each other, which was the point of the dotted keys anyway.
     *
     * One exception, and it bites: an EMPTY map is a leaf in the merge mask, so
     * `{schedule: {}}` replaces the whole section with nothing rather than
     * merging nothing into it. A caller sending an empty section is saying "no
     * changes here", never "delete every override" — clearing one is per-id, by
     * sending `null` for that id. Hence the length checks before assigning.
     */
    const eventPatch: Record<string, unknown> = {};
    const schedulePatch: Record<string, unknown> = {};

    if (events !== undefined) {
      assertPlainObject(events, "events");
      for (const [id, patch] of Object.entries(events as Record<string, unknown>)) {
        assert(
          (EVENT_IDS as readonly string[]).includes(id),
          `"${id}" is not an event`
        );

        if (patch === null) {
          eventPatch[id] = FieldValue.delete();
          continue;
        }

        assertPlainObject(patch, `events.${id}`);
        const { startsAt, endsAt } = patch as Record<string, unknown>;

        /*
         * Both ends are required together. A patch carrying only a new start
         * would be merged over a stale end, and the pair — not either field —
         * is what mealsForEvents reads.
         */
        const from = parseInstant(startsAt, `events.${id}.startsAt`);
        const to = parseInstant(endsAt, `events.${id}.endsAt`);
        assert(
          Date.parse(to) >= Date.parse(from),
          `${id} would end before it starts`
        );

        eventPatch[id] = { startsAt: from, endsAt: to };
      }
      if (Object.keys(eventPatch).length > 0) update.events = eventPatch;
    }

    if (schedule !== undefined) {
      assertPlainObject(schedule, "schedule");
      const entries = Object.entries(schedule as Record<string, unknown>);
      assert(
        entries.length <= MAX_SCHEDULE_KEYS,
        `No more than ${MAX_SCHEDULE_KEYS} schedule entries`
      );

      /*
       * Schedule ids are NOT validated against a list, unlike event ids. The
       * ids live in the config literal and Functions is a separate package that
       * cannot import from ../src — duplicating them here is the seam described
       * in Core_and_Studio.md, and duplicating one more list to enforce a
       * constraint that costs nothing to leave open isn't worth it: applyOverlay
       * maps over the literal's own items, so an id it doesn't recognise is
       * ignored rather than rendered. The key cap is what stops the document
       * being used as free storage.
       */
      for (const [id, patch] of entries) {
        assert(id.length > 0 && id.length <= 64, "schedule id is out of range");
        // These become map keys, so the character set is Firestore's problem as
        // well as ours: a leading `__` or a stray dot is a write error rather
        // than a rejected argument, which surfaces as a 500 instead of a
        // message. Config ids are slugs; hold callers to that.
        assert(/^[a-z0-9][a-z0-9_-]*$/i.test(id), `"${id}" is not a schedule id`);

        if (patch === null) {
          schedulePatch[id] = FieldValue.delete();
          continue;
        }

        assertPlainObject(patch, `schedule.${id}`);
        schedulePatch[id] = {
          startsAt: parseInstant(
            (patch as Record<string, unknown>).startsAt,
            `schedule.${id}.startsAt`
          ),
        };
      }
      if (Object.keys(schedulePatch).length > 0) update.schedule = schedulePatch;
    }

    if (emergencyContacts !== undefined) {
      assert(
        Array.isArray(emergencyContacts),
        "emergencyContacts must be an array"
      );
      const list = emergencyContacts as unknown[];
      assert(
        list.length <= MAX_CONTACTS,
        `No more than ${MAX_CONTACTS} emergency contacts`
      );

      // Replaced wholesale rather than merged. The dashboard edits the list as
      // a list — reordering and deletion are ordinary operations on it, and
      // neither survives a key-by-key merge.
      update.emergencyContacts = list.map((entry, i) => {
        assertPlainObject(entry, `emergencyContacts[${i}]`);
        const contact = entry as Record<string, unknown>;
        return {
          id: cleanString(contact.id, 64, `emergencyContacts[${i}].id`),
          name: cleanString(contact.name, MAX_NAME_LEN, `emergencyContacts[${i}].name`),
          role: cleanString(contact.role, MAX_NAME_LEN, `emergencyContacts[${i}].role`),
          phone: cleanString(contact.phone, 32, `emergencyContacts[${i}].phone`),
        };
      });
    }

    if (touchesSongOverride) {
      assert(
        typeof songRequestsOverride === "boolean",
        "songRequestsOverride must be a boolean"
      );
      update.songRequestsOverride = songRequestsOverride;
    }

    await db.collection("config").doc("live").set(update, { merge: true });

    logger.info("wedding live config updated", {
      uid: request.auth?.uid,
      sections: Object.keys(update).filter(
        (k) => k !== "updatedAt" && k !== "updatedBy"
      ),
    });

    return { ok: true, updatedAt: update.updatedAt };
  }
);

function assertSignedInStaff(rank: number): void {
  if (rank < RANK.coordinator) {
    throw new HttpsError(
      "permission-denied",
      "You need a staff account to change this."
    );
  }
}

function assertPlainObject(value: unknown, field: string): void {
  assert(
    typeof value === "object" && value !== null && !Array.isArray(value),
    `${field} must be an object`
  );
}
