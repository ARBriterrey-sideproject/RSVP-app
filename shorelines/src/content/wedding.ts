/**
 * THE READING SURFACE FOR WEDDING FACTS.
 *
 * The facts themselves moved to `wedding.config.ts`; the contract they satisfy
 * lives in `schema.ts`. This file is the third piece: it derives the named
 * values and the helpers the app actually consumes, so that nothing outside
 * `content/` has to know a config object exists.
 *
 * Two rules keep the split from rotting:
 *
 *   1. Nothing here is a fact. Every literal below is either a lookup table
 *      that is identical for every couple, or a value computed from the config.
 *      A hardcoded "Gopalpur" in this file is a bug.
 *   2. Prose that contains a number or a proper noun is *composed* here from
 *      config values, never written out. That is what lets a translator receive
 *      "About {km} km" instead of "About 170 km" — see `LOGISTICS` below.
 *
 * When core is extracted into a package, this file goes with it and only
 * `wedding.config.ts` stays behind in the instance.
 */

/*
 * Imported through the `@wedding/config` alias rather than by relative path,
 * and that is the whole injection seam.
 *
 * There is exactly one config per build — one couple, one domain, one Firebase
 * project — so it is a build-time constant, not runtime state. A React context
 * provider would have been machinery for a value that can never change while
 * the process is alive, and would have pushed the whole object across the RSC
 * boundary into every client component that reads a couple's name. An alias
 * costs nothing at runtime and moves in one line: when core becomes a package,
 * each `apps/<couple>/tsconfig.json` points this specifier at its own literal
 * and the same core code compiles against it.
 *
 * The corollary: never import `./wedding.config` by relative path from
 * anywhere. That is the one edge the alias exists to keep swappable.
 */
import { weddingConfig } from "@wedding/config";
import type {
  EventAccent,
  ScheduleItem,
  Tier,
  WeddingConfig,
  WeddingEvent,
} from "./schema";

export type {
  EmergencyContact,
  EventAccent,
  EventId,
  ScheduleItem,
  Tier,
  WeddingConfig,
  WeddingEvent,
  WeddingOverlay,
} from "./schema";

/**
 * The config this build was compiled against.
 *
 * Exported as a function rather than the bare object so the eventual runtime
 * source — a Firestore document the couple edits without a redeploy — can be
 * swapped in behind it without touching a call site. Today it returns the
 * literal; that is the whole implementation and deliberately so.
 */
export function getWeddingConfig(): WeddingConfig {
  return weddingConfig;
}

/* -------------------------------------------------------------------------
 * Core lookup tables — identical for every couple, so they stay in code.
 * ---------------------------------------------------------------------- */

/**
 * Screen 1c uses the accent as a 3px stripe down the left of the card; screen
 * 1b uses it as the filled date disc. One token, two lookups — Tailwind needs
 * whole class names in the source, so the classes can't be built by string
 * concatenation.
 */
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

/**
 * Same accent, translucent — the schedule's dress-code chip background. A
 * third lookup rather than `${ACCENT_FILL[accent]}/15`: Tailwind's scanner
 * only ever sees whole strings written out in source, so a concatenated
 * opacity modifier never becomes a real class.
 */
export const ACCENT_TINT: Record<EventAccent, string> = {
  warmgold: "bg-warmgold/15",
  palm: "bg-palm/15",
  coral: "bg-coral/15",
  deeptide: "bg-deeptide/15",
  clay: "bg-clay/15",
};

const ALL_TIERS: Tier[] = ["full", "wedding_only", "reception_only"];

/* -------------------------------------------------------------------------
 * Derived facts. Every one of these reads the config; none of them restate it.
 * ---------------------------------------------------------------------- */

export const APP_NAME = weddingConfig.appName;
export const COUPLE = weddingConfig.couple;
export const WEDDING_DATES = weddingConfig.dates;
export const DESTINATION = weddingConfig.destination;
export const EVENTS: WeddingEvent[] = weddingConfig.events;
export const SCHEDULE_ITEMS: ScheduleItem[] = weddingConfig.schedule;
export const PARTY_SIZE_SOFT_CAP = weddingConfig.party.softCap;

/**
 * The invitation-only event, kept as a single export because the app has
 * exactly one and every call site names it.
 *
 * SECURITY: this is copy, not an access decision. It reaches a guest only
 * through `eventsForGuest`, and only when their own Firestore document carries
 * the flag. Never render it off a URL, a prop default, or anything a link can
 * carry.
 */
export const SPEAKEASY: WeddingEvent = weddingConfig.invitationOnlyEvents[0];

/**
 * Travel copy, composed from config rather than written out.
 *
 * `note` and `stay.title` used to be hand-written English sentences with the
 * distances and the town baked in, which meant every translation baked them in
 * too — four files to edit for one venue change, and no way to tell that three
 * of them were now wrong. Building them here means the *numbers* have one home
 * and the *sentence* has four, which is the right way round.
 *
 * The catalogues carry the same sentences with `{km}`, `{hours}` and `{region}`
 * holes; `TRAVEL_PARAMS` below supplies the fillings. Change a distance in the
 * config and all four languages follow.
 */
export const LOGISTICS = {
  airport: {
    ...weddingConfig.logistics.airport,
    note: `About ${weddingConfig.logistics.airport.distanceKm} km — roughly ${weddingConfig.logistics.airport.driveHours} hours by road`,
  },
  station: {
    ...weddingConfig.logistics.station,
    note: `About ${weddingConfig.logistics.station.distanceKm} km — the closest railhead to ${weddingConfig.destination.region}`,
  },
  shuttle: weddingConfig.logistics.shuttle,
  stay: {
    title: `Room block — ${weddingConfig.destination.region}`,
    description: weddingConfig.logistics.stay.description,
  },
};

/**
 * The values a translated `wedding.*` string may interpolate, keyed by the
 * catalogue key that uses them.
 *
 * This is the other half of the fix described on `LOGISTICS`. A translator
 * receives "लगभग {km} किमी", never "लगभग 170 किमी", and `weddingCopy.pick`
 * looks the fillings up here by key — so no call site has to know which strings
 * happen to carry facts, and adding one is an edit in this file plus the four
 * catalogues.
 *
 * Keyed per string rather than as one shared bag because two of them use `{km}`
 * for different distances; a flat object would quietly hand the station the
 * airport's number.
 *
 * A key absent from here interpolates nothing, which is the common case.
 */
export const MESSAGE_PARAMS: Record<
  string,
  Record<string, string | number>
> = {
  "logistics.airport.note": {
    km: weddingConfig.logistics.airport.distanceKm,
    hours: weddingConfig.logistics.airport.driveHours,
    code: weddingConfig.logistics.airport.code,
    city: weddingConfig.logistics.airport.name,
  },
  "logistics.station.note": {
    km: weddingConfig.logistics.station.distanceKm,
    region: weddingConfig.destination.region,
    station: weddingConfig.logistics.station.name,
  },
  "logistics.stay.title": { region: weddingConfig.destination.region },
  "transport.airplane.description": {
    code: weddingConfig.logistics.airport.code,
    city: weddingConfig.logistics.airport.name,
    km: weddingConfig.logistics.airport.distanceKm,
    hours: weddingConfig.logistics.airport.driveHours,
  },
  "transport.train.description": {
    station: weddingConfig.logistics.station.name,
    km: weddingConfig.logistics.station.distanceKm,
  },
};

/* -------------------------------------------------------------------------
 * Derivations over the schedule.
 * ---------------------------------------------------------------------- */

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
export function mealsForEvents(
  events: WeddingEvent[],
  config: WeddingConfig = weddingConfig
): ScheduleItem[] {
  if (events.length === 0) return [];

  const arrives = Math.min(...events.map((e) => Date.parse(e.startsAt)));
  const leaves = Math.max(...events.map((e) => Date.parse(e.endsAt)));

  return config.schedule.filter((item) => {
    const at = Date.parse(item.startsAt);
    return at >= arrives && at <= leaves;
  });
}

export function isTier(value: unknown): value is Tier {
  return typeof value === "string" && (ALL_TIERS as string[]).includes(value);
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

export function eventsForTier(
  tier: Tier,
  config: WeddingConfig = weddingConfig
): WeddingEvent[] {
  return config.events.filter((event) => event.tiers.includes(tier));
}

/**
 * Everything one specific guest may see: their tier's events, plus any
 * invitation-only event the couple has flagged them for.
 *
 * Use this anywhere a real guest is on screen; `eventsForTier` alone answers
 * "what does this link carry", which is a different and always-public question.
 * Invitation-only events are spliced in chronologically rather than appended,
 * because a schedule that runs 10am, 6pm, 10pm, 10am reads as a bug.
 *
 * SECURITY: `speakeasyInvited` must come from the guest's own Firestore
 * document, never from a URL, prop default or anything a link can carry. It is
 * re-checked inside the callable's transaction — this function is UI only.
 */
export function eventsForGuest(
  tier: Tier,
  {
    speakeasyInvited = false,
    config = weddingConfig,
  }: { speakeasyInvited?: boolean; config?: WeddingConfig } = {}
): WeddingEvent[] {
  const events = eventsForTier(tier, config);
  if (!speakeasyInvited) return events;
  return [...events, ...config.invitationOnlyEvents].sort((a, b) =>
    a.startsAt.localeCompare(b.startsAt)
  );
}

export function mapsUrl(event: WeddingEvent): string {
  return `https://maps.google.com/?q=${encodeURIComponent(event.mapsQuery)}`;
}

/**
 * Calendar-day key ("2026-12-29") of an instant, in the wedding's own zone —
 * never the viewer's. Groups the schedule screen's timeline by day the same
 * way for a guest reading from Bhubaneswar and one reading from London.
 */
export function dayKey(
  iso: string,
  config: WeddingConfig = weddingConfig
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: config.dates.timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

/** One event or one schedule item, ordered onto a single timeline by time. */
export type TimelineEntry =
  | { kind: "event"; at: string; event: WeddingEvent }
  | { kind: "meal"; at: string; item: ScheduleItem };

/** Merges events and schedule items into one chronological list. */
export function scheduleTimeline(
  events: WeddingEvent[],
  items: ScheduleItem[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...events.map((event) => ({
      kind: "event" as const,
      at: event.startsAt,
      event,
    })),
    ...items.map((item) => ({
      kind: "meal" as const,
      at: item.startsAt,
      item,
    })),
  ];
  return entries.sort((a, b) => a.at.localeCompare(b.at));
}

/**
 * How long past the last event's close the "Today" screen keeps showing
 * instead of flipping back to the pre-wedding invite. A guest checking the
 * app after the reception winds down should still find emergency contacts and
 * the day's recap, not a countdown to a wedding that already happened.
 */
const WEDDING_WINDOW_GRACE_MS = 6 * 60 * 60 * 1000;

/**
 * The stretch of real time the "Today" companion screen covers, bounded by
 * the earliest event start and the latest event end across both the public
 * events and the invitation-only ones — a guest with nothing left but the
 * speakeasy shouldn't be dropped back on the invite while it's still running.
 *
 * `Date.parse`/millisecond arithmetic only, deliberately: every stored instant
 * already carries its own UTC offset, so comparing timestamps needs no zone
 * lookup and no guess about the machine asking.
 */
export function weddingWindow(config: WeddingConfig = weddingConfig): {
  startsAt: Date;
  endsAt: Date;
} {
  const events = [...config.events, ...config.invitationOnlyEvents];
  const startsAt = new Date(
    Math.min(...events.map((e) => Date.parse(e.startsAt)))
  );
  const latestEnd = Math.max(...events.map((e) => Date.parse(e.endsAt)));
  return { startsAt, endsAt: new Date(latestEnd + WEDDING_WINDOW_GRACE_MS) };
}

/**
 * Whether `now` falls inside the wedding's own days — the switch that decides
 * whether `/` renders the pre-wedding invite or the live "Today" screen. See
 * the "one app, one link, two phases" note in CLAUDE.md.
 */
export function isWeddingLive(
  config: WeddingConfig = weddingConfig,
  now: Date = new Date()
): boolean {
  const { startsAt, endsAt } = weddingWindow(config);
  return now >= startsAt && now <= endsAt;
}

/* -------------------------------------------------------------------------
 * Dietary and transport — core vocabularies, not instance facts.
 * ---------------------------------------------------------------------- */

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
 * In core rather than config because the callable validates against this exact
 * list; a couple who wants a third option needs a server change too, so
 * pretending it is per-instance data would be a lie.
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
 * How a guest is getting to the wedding. Stable ids; labels are translated.
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

/**
 * English fallbacks for the transport picker, composed from config.
 *
 * The descriptions name the airport and the railhead, which are facts — so they
 * are interpolated here and shipped to translators as `{code}` / `{station}`
 * holes rather than as finished sentences. See `TRAVEL_PARAMS`.
 */
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

/* -------------------------------------------------------------------------
 * Formatters. All of them read the config's time zone — never a literal.
 * ---------------------------------------------------------------------- */

/**
 * "You can change this until 1 March" in the mockup. Driven off the real
 * deadline so the two can never drift apart.
 */
export function rsvpDeadlineLabel(locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    timeZone: WEDDING_DATES.timeZone,
  }).format(startOfDay(WEDDING_DATES.rsvpDeadline));
}

/** "1 February 2027" — the landing spells the year out; step 1c doesn't. */
export function rsvpDeadlineLongLabel(locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: WEDDING_DATES.timeZone,
  }).format(startOfDay(WEDDING_DATES.rsvpDeadline));
}

/**
 * "28–30 December 2026" for the hero. En dash, not a hyphen — it's a range.
 *
 * Assumes the celebration doesn't straddle a month or year boundary, which is
 * true of every span the couple is considering. If that changes this needs the
 * month printed on both sides.
 */
export function weddingDateRangeLabel(locale = "en-IN"): string {
  const tz = { timeZone: WEDDING_DATES.timeZone } as const;
  const first = startOfDay(WEDDING_DATES.firstDay);
  const last = startOfDay(WEDDING_DATES.lastDay);

  const day = new Intl.DateTimeFormat(locale, { day: "numeric", ...tz });
  const monthYear = new Intl.DateTimeFormat(locale, {
    month: "long",
    year: "numeric",
    ...tz,
  });

  return `${day.format(first)}–${day.format(last)} ${monthYear.format(last)}`;
}

/** "28" — the day-of-month in the landing's coloured date disc. */
export function eventDayNumber(iso: string, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    timeZone: WEDDING_DATES.timeZone,
  }).format(new Date(iso));
}

/** "Wed 30 Dec · 10:00 am" — the event card subtitle in screen 1c. */
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

/**
 * Midnight on a bare `YYYY-MM-DD`, in the wedding's own zone.
 *
 * The offset used to be written into the string as `+05:30`, which quietly tied
 * three formatters to India. Asking `Intl` to format the UTC instant of that
 * date *in* the configured zone gets the same answer for Asia/Kolkata and the
 * right answer everywhere else — a wedding in a negative-offset zone would
 * otherwise have printed the day before.
 */
function startOfDay(isoDate: string): Date {
  const noonUtc = new Date(`${isoDate}T12:00:00Z`);
  return noonUtc;
}
