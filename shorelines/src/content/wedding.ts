/**
 * THE ONLY PLACE WEDDING FACTS LIVE.
 *
 * Every value marked PLACEHOLDER was invented by the design tool that produced
 * the identity file — it is NOT confirmed by the couple. The written plan says
 * the final date is still open. Do not treat anything below as true until the
 * couple confirms it; do not scatter these values into components.
 *
 * Event dates/times move to Firestore before launch (admins need to edit them
 * without a redeploy). This file is the seed + the local-dev fallback.
 */

export type Tier = "full" | "wedding_only" | "reception_only";

export type EventId =
  | "mehendi"
  | "haldi"
  | "sangeet"
  | "wedding"
  | "reception"
  | "speakeasy";

/**
 * Each event's own colour. Screen 1c uses it as a 3px stripe down the left of
 * the card; screen 1b uses it as the filled date disc. One token, two lookups
 * below — Tailwind needs whole class names in the source, so the classes can't
 * be built by string concatenation.
 */
export type EventAccent =
  | "warmgold"
  | "palm"
  | "coral"
  | "deeptide"
  | "clay";

export const ACCENT_BORDER: Record<EventAccent, string> = {
  warmgold: "border-warmgold",
  palm: "border-palm",
  coral: "border-coral",
  deeptide: "border-deeptide",
  clay: "border-clay",
};

export const ACCENT_FILL: Record<EventAccent, string> = {
  warmgold: "bg-warmgold",
  palm: "bg-palm",
  coral: "bg-coral",
  deeptide: "bg-deeptide",
  clay: "bg-clay",
};

export interface WeddingEvent {
  id: EventId;
  /** Display name. Translated via next-intl; this is the English fallback. */
  name: string;
  /** ISO 8601 with offset. IST = +05:30. */
  startsAt: string;
  /**
   * ISO 8601 end time. The couple gave every ceremony a window ("10 am to 2
   * pm"), and the Today screen needs the close as much as the open — it's what
   * decides whether an event is happening *now* rather than merely today.
   */
  endsAt: string;
  venue: string;
  /**
   * The venue as screen 1b writes it — "Garden lawn", not "Garden lawn, Morjim
   * Sands". The landing lists five events in a row and the hotel name repeated
   * five times is noise; the full string still carries the timeline and maps.
   */
  venueShort: string;
  /** Free-text address used for the Google Maps deep link. */
  mapsQuery: string;
  dressCode: string;
  /**
   * "Morning", "Sunset", "Night" — the landing's word for when this happens.
   * Editorial, not derived: 5:15pm on the beach is "Sunset", and no amount of
   * hour arithmetic gets you that.
   */
  daypart: string;
  /** Which tiers can see this event at all. */
  tiers: Tier[];
  accent: EventAccent;
  /**
   * A time worth calling out inside the window — the wedding's muhurat. Shown
   * as a highlighted line on the timeline, not as a separate event.
   */
  highlight?: { label: string; at: string };
  /**
   * Invitation-only: never shown by tier, only to guests the couple has
   * individually flagged. See SPEAKEASY below — `tiers` must stay empty for
   * these or the tier filter would leak them to everyone.
   */
  invitationOnly?: boolean;
}

/**
 * A fixed point in the day that isn't an event to RSVP for — meals, mostly.
 *
 * The couple's schedule interleaves these with the ceremonies ("lunch at 1 pm"
 * lands inside the Haldi window), so the timeline has to merge both lists by
 * time rather than render ceremonies and then meals.
 *
 * They carry no tier of their own — which meals a guest sees is derived from
 * when that guest is actually here. See `mealsForEvents`.
 */
export interface ScheduleItem {
  id: string;
  name: string;
  startsAt: string;
  /** Set where the couple gave one — "Dinner 8 pm during Sangeeth". */
  note?: string;
}

/** PLACEHOLDER — couple names. "Shubham" matches the repo path; confirm both. */
export const COUPLE = {
  partnerA: "Shubham",
  partnerB: "Amruta",
} as const;

/**
 * CONFIRMED by the couple: 28–30 December 2026, three days.
 *
 * The RSVP deadline is still a PLACEHOLDER — 1 December gives four weeks to
 * chase stragglers and settle catering numbers, but nobody has agreed it.
 */
export const WEDDING_DATES = {
  firstDay: "2026-12-28",
  lastDay: "2026-12-30",
  rsvpDeadline: "2026-12-01",
  timeZone: "Asia/Kolkata",
} as const;

/** CONFIRMED by the couple. Gopalpur-on-Sea, in Ganjam district. */
export const DESTINATION = {
  label: "Gopalpur, Odisha, India",
  shortLabel: "Gopalpur · Odisha",
  /** Used bare in copy — "See you in Gopalpur" on the confirmation screen. */
  region: "Gopalpur",
} as const;

/**
 * The logistics shown on step 4, "Getting there".
 *
 * The airport and station are real geography — Bhubaneswar (BBI) is the
 * nearest airport at roughly 170km, and Brahmapur is the nearest railhead at
 * roughly 16km, which is why the transport picker offers train as a first-class
 * option rather than an afterthought. The distances below are approximate and
 * the shuttle and room block are PLACEHOLDERS: neither is arranged yet.
 */
export const LOGISTICS = {
  airport: {
    code: "BBI",
    name: "Bhubaneswar",
    note: "About 170 km — roughly 3½ hours by road",
  },
  station: {
    name: "Brahmapur (BAM)",
    note: "About 16 km — the closest railhead to Gopalpur",
  },
  shuttle: {
    title: "Pickup from airport or station",
    description: "Tell us your arrival and we'll send a car",
  },
  stay: {
    title: "Room block — Gopalpur",
    description: "Held under your name until 15 December. Sea-facing on request.",
  },
} as const;

const ALL_TIERS: Tier[] = ["full", "wedding_only", "reception_only"];

/**
 * The couple's own schedule, 28–30 December 2026. Times are CONFIRMED.
 *
 * Venue names and dress codes are still PLACEHOLDERS — the couple gave times
 * and ceremonies, not rooms or what to wear. `mapsQuery` points at the town
 * until there's a named property to point at.
 *
 * Tier visibility is the real logic here:
 *   full            → all five ceremonies
 *   wedding_only    → the wedding
 *   reception_only  → the reception
 *
 * Order is chronological and load-bearing — the landing, the timeline and the
 * RSVP day-picker all render this array as given.
 */
export const EVENTS: WeddingEvent[] = [
  {
    id: "mehendi",
    name: "Mehendi",
    startsAt: "2026-12-28T19:00:00+05:30",
    endsAt: "2026-12-28T21:00:00+05:30",
    venue: "Courtyard",
    venueShort: "Courtyard",
    mapsQuery: "Gopalpur-on-Sea, Odisha",
    dressCode: "Linen & green",
    daypart: "Evening",
    tiers: ["full"],
    accent: "palm",
  },
  {
    id: "haldi",
    name: "Haldi",
    startsAt: "2026-12-29T10:00:00+05:30",
    endsAt: "2026-12-29T14:00:00+05:30",
    venue: "Garden lawn",
    venueShort: "Garden lawn",
    mapsQuery: "Gopalpur-on-Sea, Odisha",
    dressCode: "Wear yellow · barefoot",
    daypart: "Morning",
    tiers: ["full"],
    accent: "warmgold",
  },
  {
    id: "sangeet",
    name: "Sangeet",
    startsAt: "2026-12-29T18:00:00+05:30",
    endsAt: "2026-12-29T21:00:00+05:30",
    venue: "Banquet lawn",
    venueShort: "Banquet lawn",
    mapsQuery: "Gopalpur-on-Sea, Odisha",
    dressCode: "Dance-ready",
    daypart: "Evening",
    tiers: ["full"],
    accent: "coral",
  },
  {
    id: "wedding",
    name: "Wedding",
    startsAt: "2026-12-30T10:00:00+05:30",
    endsAt: "2026-12-30T14:00:00+05:30",
    venue: "Shoreline mandap",
    venueShort: "Shoreline mandap",
    mapsQuery: "Gopalpur-on-Sea, Odisha",
    dressCode: "Formal ivory",
    daypart: "Morning",
    tiers: ["full", "wedding_only"],
    accent: "deeptide",
    highlight: { label: "Muhurat", at: "2026-12-30T11:28:00+05:30" },
  },
  {
    id: "reception",
    name: "Reception",
    startsAt: "2026-12-30T18:30:00+05:30",
    endsAt: "2026-12-30T21:00:00+05:30",
    venue: "Terrace",
    venueShort: "Terrace",
    mapsQuery: "Gopalpur-on-Sea, Odisha",
    dressCode: "Formal",
    daypart: "Evening",
    tiers: ["full", "reception_only"],
    accent: "clay",
  },
];

/**
 * The couple's private gathering between the public events.
 *
 * Deliberately NOT in EVENTS and deliberately carrying no tier. It is revealed
 * only to guests the couple has individually flagged in the dashboard, so it
 * must never pass through `eventsForTier` — a tier is a link, and links get
 * forwarded. Time and venue are PLACEHOLDERS; the couple hasn't set them.
 *
 * SECURITY: the reveal is enforced in Firestore rules, not here. Treat this
 * object as copy, not as an access decision — never render it without first
 * checking the guest's own `speakeasyInvited` flag.
 */
export const SPEAKEASY: WeddingEvent = {
  id: "speakeasy",
  name: "The Speakeasy",
  startsAt: "2026-12-29T22:00:00+05:30",
  endsAt: "2026-12-30T01:00:00+05:30",
  venue: "Told to you on the night",
  venueShort: "Told to you on the night",
  mapsQuery: "Gopalpur-on-Sea, Odisha",
  dressCode: "Whatever you danced in",
  daypart: "Late",
  tiers: [],
  accent: "deeptide",
  invitationOnly: true,
};

/**
 * Meals and other fixed points. Merged with EVENTS by time on the timeline.
 *
 * The 28th's dinner has no separate slot in the couple's schedule — it reads
 * "7 to 9 pm - Mehandi, and Dinner", one thing, so it stays a note on the
 * Mehendi rather than a second line at the same hour.
 */
export const SCHEDULE_ITEMS: ScheduleItem[] = [
  { id: "breakfast-29", name: "Breakfast", startsAt: "2026-12-29T08:00:00+05:30" },
  { id: "lunch-29", name: "Lunch", startsAt: "2026-12-29T13:00:00+05:30" },
  {
    id: "dinner-29",
    name: "Dinner",
    startsAt: "2026-12-29T20:00:00+05:30",
    note: "Served during the Sangeet",
  },
  { id: "breakfast-30", name: "Breakfast", startsAt: "2026-12-30T07:00:00+05:30" },
  { id: "lunch-30", name: "Lunch", startsAt: "2026-12-30T13:00:00+05:30" },
];

/**
 * The meals that fall inside one guest's own stay.
 *
 * Derived, not tagged per tier: a meal is theirs if it happens between the
 * start of the first celebration they're coming to and the end of the last.
 * Someone invited only to the Reception at 6:30 pm should not be handed that
 * morning's breakfast — they aren't in Gopalpur yet — while a guest here from
 * the Mehendi through to the Reception sees every meal in between, including
 * the ones on mornings with no ceremony to RSVP for.
 *
 * Deriving it also means it survives the couple moving a ceremony. A list of
 * tiers hand-written onto each meal would drift out of step the first time a
 * time changed, and nothing would fail loudly when it did.
 *
 * Pass the events the guest is actually attending where that's known; passing
 * their tier's events answers the more general "what does this invite cover".
 */
export function mealsForEvents(events: WeddingEvent[]): ScheduleItem[] {
  if (events.length === 0) return [];

  const arrives = Math.min(...events.map((e) => Date.parse(e.startsAt)));
  const leaves = Math.max(...events.map((e) => Date.parse(e.endsAt)));

  return SCHEDULE_ITEMS.filter((item) => {
    const at = Date.parse(item.startsAt);
    return at >= arrives && at <= leaves;
  });
}

export function isTier(value: unknown): value is Tier {
  return (
    typeof value === "string" && (ALL_TIERS as string[]).includes(value)
  );
}

/**
 * What the tier looks like in a URL: `?tier=f`, not `?tier=wedding_only`.
 *
 * The spelled-out values were doing two things we didn't want. They told a
 * guest which invite they'd been given the moment they read the address bar —
 * "wedding_only" is a demotion in plain sight — and they handed anyone who
 * noticed the obvious edit to make.
 *
 * These codes are short, not secret. Someone who tries all three letters will
 * find all three views; that is accepted, because access is open by design and
 * the tier stored against an RSVP is fixed on first submission regardless.
 * Canonical values are unchanged — this is a URL alias, not a data change.
 */
const TIER_CODES = {
  f: "full",
  w: "wedding_only",
  r: "reception_only",
} as const satisfies Record<string, Tier>;

/** The code to put in a shareable link. Used by the dashboard's copy flow. */
export function tierCode(tier: Tier): string {
  const entry = Object.entries(TIER_CODES).find(([, t]) => t === tier);
  return entry?.[0] ?? "f";
}

/**
 * Resolves the tier from a URL query param. Anything unrecognised — including a
 * missing param — falls back to `full`, the most permissive view: a guest whose
 * link got mangled by a chat app should land on a working invite, not a wall.
 *
 * SECURITY: this is presentation only. The authoritative tier is written once,
 * server-side, at RSVP creation and is immutable thereafter. Never trust a
 * client-supplied tier on a write path.
 */
export function resolveTier(param: string | string[] | undefined): Tier {
  const raw = Array.isArray(param) ? param[0] : param;
  return typeof raw === "string" && raw in TIER_CODES
    ? TIER_CODES[raw as keyof typeof TIER_CODES]
    : "full";
}

/** Builds the RSVP link for a tier — the landing's CTA and the copy flow. */
export function rsvpHref(tier: Tier): string {
  return `/rsvp?tier=${tierCode(tier)}`;
}

export function eventsForTier(tier: Tier): WeddingEvent[] {
  return EVENTS.filter((event) => event.tiers.includes(tier));
}

/**
 * Everything one specific guest may see: their tier's events, plus any
 * invitation-only event the couple has flagged them for.
 *
 * Use this anywhere a real guest is on screen; `eventsForTier` alone answers
 * "what does this link carry", which is a different and always-public question.
 * The speakeasy is spliced in chronologically rather than appended, because a
 * schedule that runs 10am, 6pm, 10pm, 10am reads as a bug.
 *
 * SECURITY: `speakeasyInvited` must come from the guest's own Firestore
 * document, never from a URL, prop default or anything a link can carry.
 */
export function eventsForGuest(
  tier: Tier,
  { speakeasyInvited = false }: { speakeasyInvited?: boolean } = {}
): WeddingEvent[] {
  const events = eventsForTier(tier);
  if (!speakeasyInvited) return events;
  return [...events, SPEAKEASY].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt)
  );
}

export function mapsUrl(event: WeddingEvent): string {
  return `https://maps.google.com/?q=${encodeURIComponent(event.mapsQuery)}`;
}

/**
 * Dietary options — veg or non-veg, with the detail captured as free text.
 *
 * This REVERSES an earlier decision. The plan said a veg/non-veg toggle was
 * wrong and named Jain, Satvik and vegan as first-class categories; the couple
 * asked for the toggle plus a restrictions field instead, which is what the
 * caterer actually works from. The nuance didn't get dropped — it moved from a
 * fixed list into `dietaryNotes`, where a guest can write "Jain, no root veg"
 * and be understood, rather than picking the nearest of six labels.
 *
 * Values are stable IDs; labels are translated. `vegetarian` deliberately keeps
 * its old id so RSVPs stored before the change still hydrate.
 */
export const DIETARY_OPTIONS = ["vegetarian", "non_vegetarian"] as const;

export type DietaryOption = (typeof DIETARY_OPTIONS)[number];

/** Guards data read back out of Firestore, which is untyped at the edge. */
export function isDietaryOption(value: unknown): value is DietaryOption {
  return (DIETARY_OPTIONS as readonly string[]).includes(value as string);
}

/**
 * Coerces any stored value to a live option.
 *
 * An earlier six-option list (jain, satvik, vegan, seafood_non_veg,
 * no_restriction) was carried forward by an explicit migration map here. It's
 * gone: those ids were only ever written against the emulator, which is wiped
 * on every restart, so there is nothing in existence to migrate. If a real
 * project is ever seeded from old data, restore the map from git rather than
 * letting values fall through to the default — silently turning someone's
 * seafood answer into vegetarian is worse than rejecting it.
 */
export function normaliseDietary(value: unknown): DietaryOption {
  return isDietaryOption(value) ? value : "vegetarian";
}

/**
 * Labels and the one-line menu descriptions for screen 1c ("At the table").
 *
 * Kept deliberately plain. The old copy described specific dishes ("kokum",
 * "the day's catch") which was charming and unverifiable — the caterer isn't
 * booked. These say only what the couple can promise.
 */
export const DIETARY_COPY: Record<
  DietaryOption,
  { label: string; description: string }
> = {
  vegetarian: {
    label: "Vegetarian",
    description: "No meat, fish or egg",
  },
  non_vegetarian: {
    label: "Non-vegetarian",
    description: "Everything on the table",
  },
};

/**
 * How a guest is getting to Gopalpur. Stable ids; labels are translated.
 *
 * "self" covers driving, a hired car, a bus — anything the couple doesn't need
 * to meet. It exists so that a guest who needs no pickup can say so in one tap
 * instead of leaving the step blank and looking like an unanswered question.
 */
export const TRANSPORT_MODES = ["airplane", "train", "self"] as const;

export type TransportMode = (typeof TRANSPORT_MODES)[number];

export function isTransportMode(value: unknown): value is TransportMode {
  return (TRANSPORT_MODES as readonly string[]).includes(value as string);
}

export const TRANSPORT_COPY: Record<
  TransportMode,
  { label: string; description: string; serviceLabel?: string }
> = {
  airplane: {
    label: "Airplane",
    description: `Into ${LOGISTICS.airport.code} — ${LOGISTICS.airport.note.toLowerCase()}`,
    serviceLabel: "Flight number",
  },
  train: {
    label: "Train",
    description: `To ${LOGISTICS.station.name} — the closest railhead`,
    serviceLabel: "Train name or number",
  },
  self: {
    label: "Driving myself",
    description: "By car or bus — no pickup needed",
  },
};

/**
 * Soft cap on party size per submission. The plan flags this as an open item;
 * 15 is a starting guess, not a decision. Enforced server-side in the callable
 * Function — the client value here is only for inline validation feedback.
 */
export const PARTY_SIZE_SOFT_CAP = 15;

/**
 * "You can change this until 1 March" in the mockup. Driven off the real
 * deadline so the two can never drift apart.
 */
export function rsvpDeadlineLabel(locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: WEDDING_DATES.timeZone,
  }).format(new Date(`${WEDDING_DATES.rsvpDeadline}T00:00:00+05:30`));
}

/** "1 February 2027" — the landing spells the year out; step 1c doesn't. */
export function rsvpDeadlineLongLabel(locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: WEDDING_DATES.timeZone,
  }).format(new Date(`${WEDDING_DATES.rsvpDeadline}T00:00:00+05:30`));
}

/**
 * "11–14 March 2027" for the hero. En dash, not a hyphen — it's a range.
 *
 * Assumes the celebration doesn't straddle a month or year boundary, which is
 * true of every four-day span the couple is considering. If that changes this
 * needs the month printed on both sides.
 */
export function weddingDateRangeLabel(locale = "en-IN"): string {
  const tz = { timeZone: WEDDING_DATES.timeZone } as const;
  const first = new Date(`${WEDDING_DATES.firstDay}T00:00:00+05:30`);
  const last = new Date(`${WEDDING_DATES.lastDay}T00:00:00+05:30`);

  const day = new Intl.DateTimeFormat(locale, { day: "numeric", ...tz });
  const monthYear = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    ...tz,
  });

  return `${day.format(first)}–${day.format(last)} ${monthYear.format(last)}`;
}

/** "11" — the day-of-month in the landing's coloured date disc. */
export function eventDayNumber(iso: string, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    timeZone: WEDDING_DATES.timeZone,
  }).format(new Date(iso));
}

/** "Wed 11 Mar · 10:00 am" — the event card subtitle in screen 1c. */
export function formatEventWhen(iso: string, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: WEDDING_DATES.timeZone,
  }).format(new Date(iso));
}
