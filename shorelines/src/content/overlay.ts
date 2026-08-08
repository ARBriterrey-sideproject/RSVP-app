/**
 * MERGING THE RUNTIME OVERLAY ONTO THE COMPILED CONFIG.
 *
 * Core, not instance: nothing here is a fact about anybody's wedding. It is one
 * pure function plus the guards that keep a bad document from taking the site
 * down, and it is the only place the two halves of a wedding's facts meet.
 *
 * Where this sits matters. The merge happens *below* every derivation in
 * `wedding.ts` — `mealsForEvents`, `eventsForGuest`, every formatter — because
 * those read times and compute from them. A merge applied above the derivations
 * would move an event on screen while `mealsForEvents` went on windowing meals
 * against the literal, and a guest would quietly be shown the wrong meals with
 * nothing failing anywhere. Merge first, derive second, always.
 */

import type {
  ScheduleItem,
  WeddingConfig,
  WeddingEvent,
  WeddingOverlay,
} from "./schema";

/**
 * The config as it should be rendered right now.
 *
 * Field-by-field, `overlay ?? literal`. An absent overlay returns the literal
 * unchanged — and by identity, not a copy, so the common path costs nothing.
 *
 * This function never throws and never rejects a document. A bad value is
 * dropped and the literal shows through, which is the only acceptable failure
 * mode for a page a guest opens at a venue: the times may be stale, but there
 * is always a time. The callable is where a bad write is *refused*; this is the
 * second line, for anything that got in before the validation did.
 */
export function applyOverlay(
  config: WeddingConfig,
  overlay: WeddingOverlay | null | undefined
): WeddingConfig {
  if (!overlay) return config;

  const events = mergeEvents(config.events, overlay);
  const invitationOnlyEvents = mergeEvents(config.invitationOnlyEvents, overlay);
  const schedule = mergeSchedule(config.schedule, overlay);

  return { ...config, events, invitationOnlyEvents, schedule };
}

/**
 * Emergency contacts, which exist only in the overlay.
 *
 * Separate from `applyOverlay` because they are not part of `WeddingConfig` and
 * putting them there would have meant every instance literal carrying an empty
 * array forever to satisfy a type.
 */
export function emergencyContacts(
  overlay: WeddingOverlay | null | undefined
): WeddingOverlay["emergencyContacts"] {
  return overlay?.emergencyContacts ?? [];
}

function mergeEvents(
  events: WeddingEvent[],
  overlay: WeddingOverlay
): WeddingEvent[] {
  if (!overlay.events) return events;

  const merged = events.map((event) => {
    const patch = overlay.events?.[event.id];
    if (!patch) return event;

    const startsAt = validInstant(patch.startsAt) ?? event.startsAt;
    const endsAt = validInstant(patch.endsAt) ?? event.endsAt;

    /*
     * An inverted window is rejected as a pair rather than field by field.
     * Taking a good `startsAt` and leaving a stale `endsAt` behind it produces
     * an event that ends before it begins, and `mealsForEvents` reads exactly
     * that pair to decide which meals a guest is here for — it would return an
     * empty list and look like a guest simply had no meals.
     */
    if (Date.parse(endsAt) < Date.parse(startsAt)) return event;

    return { ...event, startsAt, endsAt };
  });

  return sortByStart(merged);
}

function mergeSchedule(
  schedule: ScheduleItem[],
  overlay: WeddingOverlay
): ScheduleItem[] {
  if (!overlay.schedule) return schedule;

  const merged = schedule.map((item) => {
    const startsAt = validInstant(overlay.schedule?.[item.id]?.startsAt);
    return startsAt ? { ...item, startsAt } : item;
  });

  return sortByStart(merged);
}

/**
 * Re-sorting is not cosmetic.
 *
 * `WeddingConfig` documents both lists as chronological and the landing, the
 * timeline and the day-picker all render them in the order given. Moving the
 * Haldi to the evening without re-sorting leaves a schedule that reads 10am,
 * 6pm, 10pm, 11am — which looks like a rendering bug rather than an edit.
 */
function sortByStart<T extends { startsAt: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * An ISO 8601 instant, or `undefined` if it is anything else.
 *
 * `Date.parse` alone is too permissive — it accepts "December 28" and resolves
 * it against the *current* year in the server's own zone, so a half-typed value
 * would land as a real date in the wrong place rather than being rejected. The
 * shape check first means only a full timestamp with an offset gets through,
 * which is what the config literal uses and what the callable writes.
 */
function validInstant(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?([+-]\d{2}:\d{2}|Z)$/.test(value))
    return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}
