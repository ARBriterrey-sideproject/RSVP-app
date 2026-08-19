import { isTransportMode, type DietaryOption, type TransportMode } from "@/content/wedding";

/**
 * One person in the party.
 *
 * `name` is optional for everyone except the first member — the mockup's own
 * copy is "Names can come later", and forcing a full list up front is the
 * quickest way to lose an RSVP. The caterer's headcount comes from `dietary`,
 * which is always set.
 *
 * `id` is client-only (React keys, override tracking) and is stripped before
 * the payload goes to the callable.
 */
export interface PartyMember {
  id: string;
  name: string;
  ageGroup: "adult" | "child";
  dietary: DietaryOption;
}

/**
 * Step 4, "Getting there". Every field is optional — see StepTravel.
 *
 * Dates, not datetimes. The couple asked for arrival and departure *dates*, and
 * that is also the honest resolution: a guest booking two months out knows the
 * day, rarely the hour. The car gets arranged from the day plus the mode.
 */
export interface Travel {
  arrivalOn: string;
  departureOn: string;
  mode: TransportMode | "";
  /** Flight or train number, when they have one. Ignored for "self". */
  serviceNumber: string;
  wantsPickup: boolean;
}

export function emptyTravel(): Travel {
  return {
    arrivalOn: "",
    departureOn: "",
    mode: "",
    serviceNumber: "",
    wantsPickup: false,
  };
}

/**
 * The four numbered steps of screen 1c, in the mockup's own order.
 *
 * There is no identity step. The mockup opens on "Which days?" because it
 * treats the guest as already known, and Anonymous Auth makes that literally
 * true — sign-in is silent, so "loading" (resolving the anonymous session, and
 * any stored reply for it) is the only screen before "days", and it is not one
 * of the four numbered ones. That is what lets the progress bar read 1/4–4/4
 * exactly as designed instead of growing a fifth segment.
 */
export const STEPS = ["days", "party", "table", "travel"] as const;
export type Step = (typeof STEPS)[number];
export type Screen = "loading" | Step | "done";

export function makeMember(ageGroup: "adult" | "child" = "adult"): PartyMember {
  return {
    id: newMemberId(),
    name: "",
    ageGroup,
    dietary: "vegetarian",
  };
}

function newMemberId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Rebuilds the client-side flow state from a stored RSVP so a returning guest
 * edits their real answers instead of a blank form.
 *
 * Everything is re-validated on the way in: the document was written by the
 * callable, but a shape from an older deploy is still possible, and a bad
 * `dietary` string would break the radio list rather than fail loudly.
 *
 * `normalise` rather than a guard, because the dietary list shrank from six
 * options to two. A stored `seafood_non_veg` is not invalid data to discard —
 * it's an answer to migrate, and dropping it to the default would flip a guest
 * to vegetarian behind their back.
 */
export function hydrateParty(
  stored: unknown,
  normalise: (v: unknown) => DietaryOption
): PartyMember[] | null {
  if (!Array.isArray(stored) || stored.length === 0) return null;

  return stored.map((raw) => {
    const m = (raw ?? {}) as Record<string, unknown>;
    return {
      id: newMemberId(),
      name: typeof m.name === "string" ? m.name : "",
      ageGroup: m.ageGroup === "child" ? "child" : "adult",
      dietary: normalise(m.dietary),
    };
  });
}

export function hydrateTravel(stored: unknown): Travel {
  const t = (stored ?? {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  return {
    arrivalOn: str(t.arrivalOn),
    departureOn: str(t.departureOn),
    mode: isTransportMode(t.mode) ? t.mode : "",
    serviceNumber: str(t.serviceNumber),
    wantsPickup: t.wantsPickup === true,
  };
}
