/**
 * THE SHAPE OF A WEDDING — core, not instance.
 *
 * Nothing in this file is a fact about anybody's wedding. It is the contract
 * that one `WeddingConfig` literal must satisfy, and it is the half of
 * `content/` that survives being extracted into a shared core package: every
 * couple's app compiles against these types and supplies its own literal.
 *
 * The rule that keeps the split honest: if a value would differ between two
 * couples, it belongs in the config literal, not here. If it would be identical
 * for every couple — a Tailwind class lookup, a validation table — it belongs
 * here.
 */

export type Tier = "full" | "wedding_only" | "reception_only";

/**
 * Event ids for THIS instance.
 *
 * A union rather than `string` because it buys real safety today — a typo in a
 * `perEventAttendance` key fails to compile. It is also the one type here that
 * is genuinely instance-shaped, and the first thing that has to generalise when
 * core is extracted: at that point this becomes `string`, and the ids get
 * validated against the config at runtime instead. Left as a union until then
 * rather than weakened early for a refactor that hasn't happened.
 */
export type EventId =
  | "mehendi"
  | "haldi"
  | "sangeet"
  | "wedding"
  | "reception";

/**
 * Each event's own colour, as a token name rather than a value.
 *
 * Deliberately an enum and not a hex string: Tailwind v4 scans source for whole
 * class names, so `border-${accent}` can never work. A config supplies the name
 * of a swatch the theme already defines; it cannot invent a colour. When a
 * couple wants a different palette, the *values* behind these names change in
 * the theme's `@theme` block — the names don't.
 */
export type EventAccent =
  | "warmgold"
  | "palm"
  | "coral"
  | "deeptide"
  | "clay";

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

/**
 * Travel facts, split so that no number ever lives inside a sentence.
 *
 * This split is the whole reason the type exists. "About 170 km — roughly 3½
 * hours by road" was a single English string, which meant three translators
 * copied 170 and 3½ into Hindi, Kannada and Odia prose by hand. Changing the
 * venue then required editing four files and hoping nobody missed one. The
 * numbers are config; the sentence around them is a message catalogue with
 * `{km}` and `{hours}` holes in it.
 *
 * `driveHours` is a string, not a number, because "3½" is typography that
 * `Intl.NumberFormat` will not produce and "3.5 hours by road" reads worse.
 */
export interface TravelPoint {
  /** "Brahmapur (BAM)" — as a guest reads it off a ticket. Stays Latin. */
  name: string;
  distanceKm: number;
}

export interface AirportPoint extends TravelPoint {
  /** IATA code, shown on its own in tight rows — "Fly into BBI". */
  code: string;
  /** Display fraction, not a float. See the note above. */
  driveHours: string;
}

export interface LogisticsConfig {
  airport: AirportPoint;
  station: TravelPoint;
  /** Prose the couple writes; no facts embedded. Translatable. */
  shuttle: { title: string; description: string };
  stay: { description: string };
}

/**
 * Everything that makes one wedding different from another.
 *
 * One object rather than a module of named exports, because a module cannot be
 * passed, swapped, validated or generated. This is the artifact the studio's
 * intake form produces: fill the form, emit one of these, build an app around
 * it.
 */
export interface WeddingConfig {
  /**
   * Bumped when this interface changes in a way existing literals don't satisfy.
   * Instances built against an older core are migrated forward by version, so a
   * literal that predates a field can be told apart from one that omits it.
   */
  configVersion: 1;
  /** URL-safe instance id — the studio's key for this couple. */
  slug: string;
  /** The app's own name, shown in the tab title and share previews. */
  appName: string;
  couple: { partnerA: string; partnerB: string };
  dates: {
    firstDay: string;
    lastDay: string;
    rsvpDeadline: string;
    /** IANA zone. Every formatter in `wedding.ts` reads this, never a literal. */
    timeZone: string;
  };
  destination: {
    label: string;
    shortLabel: string;
    /** Used bare in copy — "See you in Gopalpur". */
    region: string;
    /** Decimal degrees. Feeds the Today screen's weather card — nothing else. */
    coordinates: { lat: number; lng: number };
  };
  logistics: LogisticsConfig;
  /** Chronological. The landing, timeline and day-picker render it as given. */
  events: WeddingEvent[];
  /** Meals and other fixed points, merged into the timeline by time. */
  schedule: ScheduleItem[];
  party: { softCap: number };
}

/* -------------------------------------------------------------------------
 * The runtime overlay — the half of a wedding that changes without a rebuild.
 * ---------------------------------------------------------------------- */

/**
 * WHAT THE COUPLE CAN CHANGE AFTER THE APP IS BUILT.
 *
 * The config literal above is compiled in, so changing it means a rebuild and a
 * redeploy — which is the correct answer for anything structural, and the wrong
 * answer for a time. Weddings move times in the last fortnight, from a phone, at
 * a venue, by someone who does not have repo access. That is what this is for.
 *
 * The split follows one test: **does the change alter the shape of the app?**
 *
 *   Rebuild (stays in `WeddingConfig`)   Overlay (lives in Firestore)
 *   ──────────────────────────────────   ────────────────────────────
 *   which events exist, and their ids    when each event starts and ends
 *   which tiers can see them             when each meal is served
 *   how many days                        who to call in an emergency
 *   locales, theme, RSVP steps
 *   party cap
 *
 * Everything here is optional at every level. An absent overlay — no document,
 * a failed read, a field nobody has touched — leaves the literal showing, which
 * is what makes this safe to ship before the dashboard that writes it exists.
 *
 * Deliberately NOT here yet: venue names and dress codes. They are translated
 * through the catalogue-override path in `i18n/weddingCopy.ts`, and a string a
 * couple types into a dashboard is a string no catalogue knows — hi/kn/or would
 * silently fall back to English with nothing in the console to say so. Times
 * don't have that problem because `Intl` formats them and no translator ever
 * sees them. Text needs a per-locale editor first; see Core_and_Studio.md.
 */
export interface WeddingOverlay {
  /** Keyed by `WeddingEvent.id`. An unknown id is ignored, not an error. */
  events?: Record<string, { startsAt?: string; endsAt?: string }>;
  /** Keyed by `ScheduleItem.id`. */
  schedule?: Record<string, { startsAt?: string }>;
  /**
   * Runtime-native: these have no counterpart in the literal and never should.
   * A phone number that can only be corrected by a developer is worse than no
   * phone number, because the whole point of the list is the day it's needed.
   */
  emergencyContacts?: EmergencyContact[];
  /**
   * Runtime-native, like the contacts above: lets an admin keep the DJ queue
   * open past the normal 1-hour-before-the-event cutoff for every event, from
   * the dashboard, without a rebuild. Absent or `false` is the normal cutoff.
   */
  songRequestsOverride?: boolean;
  /** ISO 8601. Written server-side; shown in the dashboard as "last edited". */
  updatedAt?: string;
  /** The staff uid that last wrote this. Audit only, never rendered to guests. */
  updatedBy?: string;
}

export interface EmergencyContact {
  id: string;
  name: string;
  /** "Groom's brother", "Hotel front desk" — who this person is to a guest. */
  role: string;
  /** Stored as the couple types it; rendered into a `tel:` link. */
  phone: string;
}

/**
 * A gathering the couple adds after the app is built, shown only to the guests
 * they name one by one.
 *
 * Runtime data, not config: which private events exist is the couple's to
 * decide on the day, and nothing about them changes the shape of the app. They
 * live in `privateEvents/{id}` and reach a guest only through the
 * `getMyPrivateEvents` callable, which reads the invite list off that guest's
 * own RSVP document server-side.
 *
 * There is nothing to RSVP for. A private event is a reveal — the couple has
 * already decided who's coming, so the app's job is to tell those guests where
 * and when, not to ask them again. That is why this shares no fields with
 * `WeddingEvent` beyond the obvious ones and carries no `tiers`: a tier filter
 * that could reach one would defeat the entire point.
 */
export interface PrivateEvent {
  id: string;
  name: string;
  /** ISO 8601 with offset, same as `WeddingEvent`. */
  startsAt: string;
  endsAt: string;
  venue: string;
  /** Free-text address for the Google Maps deep link. May be empty. */
  mapsQuery: string;
  dressCode: string;
  /** Anything else the guest should know. May be empty. */
  note: string;
}
