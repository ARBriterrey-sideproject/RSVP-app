import {
  DIETARY_COPY,
  MESSAGE_PARAMS,
  TRANSPORT_COPY,
  type DietaryOption,
  type ScheduleItem,
  type TransportMode,
  type WeddingEvent,
} from "@/content/wedding";

/**
 * Wedding facts stay authored in English in `content/wedding.ts`; the message
 * catalogues only *override* them.
 *
 * The alternative — copying every event name into `messages/en.json` — would
 * give the same string two homes and no way to tell which one was edited last.
 * `wedding.ts` is documented as the only place wedding facts live, and a file
 * of ids and timestamps with the names moved out stops being readable as the
 * schedule it's meant to be. So English falls through to the object, and
 * `hi` / `kn` / `or` supply keys under the `wedding` namespace to replace it.
 *
 * The practical consequence: a key missing from a catalogue is not a bug and
 * must not render as `wedding.events.haldi.name`. Anything still marked
 * PLACEHOLDER in `wedding.ts` — venue names, dress codes — is deliberately
 * absent from all four catalogues, because translating a string the couple
 * hasn't confirmed only means translating it twice.
 */
export type Lookup = ((
  key: string,
  values?: Record<string, string | number>
) => string) & {
  has: (key: string) => boolean;
};

/**
 * The fallback rule, plus the fact injection.
 *
 * A handful of `wedding.*` strings are sentences with facts in them — "About
 * {km} km — roughly {hours} hours by road". The catalogues carry the sentence
 * with the holes; `MESSAGE_PARAMS` carries the fillings, keyed by the same
 * string key. Looking them up here rather than at the call sites is what keeps
 * `override(t, "logistics.station.note", …)` reading the same as every other
 * lookup: no caller has to know which keys happen to interpolate.
 *
 * Passing `undefined` for a key with no params is what next-intl expects, so
 * the common case costs nothing.
 */
function pick(t: Lookup, key: string, fallback: string): string {
  if (!t.has(key)) return fallback;
  const params = MESSAGE_PARAMS[key];
  return t(key, params && localiseParams(t, params));
}

/**
 * Place names that are themselves translatable, mapped to the key that
 * translates them.
 *
 * `MESSAGE_PARAMS` holds the English config values, which is right for a code
 * off a boarding pass and wrong for a town: "Gopalpur का सबसे नज़दीकी स्टेशन"
 * is a worse sentence than the one it replaced. Everything not listed here —
 * `{station}`, `{code}`, `{km}` — is deliberately left as authored, because a
 * guest matches those against a ticket.
 */
const TRANSLATABLE_PARAMS: Record<string, string> = {
  region: "destination.region",
};

function localiseParams(
  t: Lookup,
  params: Record<string, string | number>
): Record<string, string | number> {
  const out: Record<string, string | number> = { ...params };
  for (const [name, key] of Object.entries(TRANSLATABLE_PARAMS)) {
    if (name in out && t.has(key)) out[name] = t(key);
  }
  return out;
}

/**
 * The same fallback rule for a one-off string that doesn't belong to any of
 * the shapes below — the distance notes under the airport and station rows,
 * whose titles are built by ICU on the page but whose bodies are plain facts.
 */
export { pick as override };

export interface EventCopy {
  name: string;
  venue: string;
  venueShort: string;
  dressCode: string;
  daypart: string;
  /** Only the wedding has one — the muhurat. */
  highlightLabel?: string;
}

/** Pass a translator scoped to the `wedding` namespace. */
export function eventCopy(t: Lookup, event: WeddingEvent): EventCopy {
  const base = `events.${event.id}`;
  return {
    name: pick(t, `${base}.name`, event.name),
    venue: pick(t, `${base}.venue`, event.venue),
    venueShort: pick(t, `${base}.venueShort`, event.venueShort),
    dressCode: pick(t, `${base}.dressCode`, event.dressCode),
    daypart: pick(t, `${base}.daypart`, event.daypart),
    highlightLabel: event.highlight
      ? pick(t, `${base}.highlight`, event.highlight.label)
      : undefined,
  };
}

export interface ScheduleCopy {
  name: string;
  note?: string;
}

/**
 * Meals are keyed by *kind*, not by id: `breakfast-29` and `breakfast-30` are
 * the same word, and asking a translator for it twice invites them to drift.
 * The trailing day number is dropped, so a new `breakfast-31` needs no new key.
 */
export function scheduleCopy(t: Lookup, item: ScheduleItem): ScheduleCopy {
  const kind = item.id.replace(/-\d+$/, "");
  return {
    name: pick(t, `schedule.${kind}.name`, item.name),
    note: item.note
      ? pick(t, `schedule.${item.id}.note`, item.note)
      : undefined,
  };
}

export interface LogisticsCopy {
  title: string;
  description: string;
}

export function logisticsCopy(
  t: Lookup,
  key: "shuttle" | "stay",
  fallback: { title: string; description: string }
): LogisticsCopy {
  return {
    title: pick(t, `logistics.${key}.title`, fallback.title),
    description: pick(t, `logistics.${key}.description`, fallback.description),
  };
}

/**
 * "Vegetarian — no meat, fish or egg".
 *
 * These two are the only labels a guest picks *between*, so an untranslated one
 * is worse than an untranslated heading: it's a choice they can't read. The
 * fallback still applies, but every catalogue is expected to carry them.
 */
export function dietaryCopy(t: Lookup, option: DietaryOption): LogisticsCopy {
  const fallback = DIETARY_COPY[option];
  return {
    title: pick(t, `dietary.${option}.label`, fallback.label),
    description: pick(t, `dietary.${option}.description`, fallback.description),
  };
}

export interface TransportCopy extends LogisticsCopy {
  /** Absent for "self" — there is no service number for a car. */
  serviceLabel?: string;
}

/**
 * The descriptions name the airport and the railhead, so the translated strings
 * are sentences with `{code}` / `{station}` holes and `pick` supplies the
 * values. The names themselves stay Latin inside the translated sentence —
 * they're proper nouns a guest reads off a ticket.
 */
export function transportCopy(t: Lookup, mode: TransportMode): TransportCopy {
  const fallback = TRANSPORT_COPY[mode];
  return {
    title: pick(t, `transport.${mode}.label`, fallback.label),
    description: pick(t, `transport.${mode}.description`, fallback.description),
    serviceLabel: fallback.serviceLabel
      ? pick(t, `transport.${mode}.serviceLabel`, fallback.serviceLabel)
      : undefined,
  };
}
