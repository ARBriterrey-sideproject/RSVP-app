/**
 * SPLITTING AN ISO INSTANT INTO WHAT A PERSON TYPES, AND BACK.
 *
 * The dashboard edits times with a `<input type="date">` and a
 * `<input type="time">` rather than a `datetime-local`, and that is a decision
 * about time zones, not about layout.
 *
 * The config stores `2026-12-29T10:00:00+05:30` — a wall-clock time in India
 * with its offset spelled out. `datetime-local` would hand the browser's own
 * zone back: a coordinator opening the dashboard from London and pressing save
 * without touching anything would rewrite every ceremony five and a half hours
 * early, silently and plausibly. Date and time inputs show and return exactly
 * the digits typed into them, so the offset is never inferred — it is carried
 * across unchanged from the value being edited.
 *
 * That is the whole trick: the offset comes from the string, never from the
 * machine doing the editing.
 */

const INSTANT =
  /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(?::\d{2})?([+-]\d{2}:\d{2}|Z)$/;

export interface WallClock {
  /** `YYYY-MM-DD`, as `<input type="date">` speaks it. */
  date: string;
  /** `HH:MM`, 24-hour, as `<input type="time">` speaks it. */
  time: string;
  /** `+05:30` or `Z`, taken from the instant being edited. */
  offset: string;
}

/** `null` for anything that isn't a full instant — never a guess. */
export function splitInstant(iso: string): WallClock | null {
  const match = INSTANT.exec(iso);
  if (!match) return null;
  return { date: match[1], time: match[2], offset: match[3] };
}

/**
 * Seconds are always `:00`. Every time in the config lands on a minute, and the
 * callable's validator accepts the seconds-less form too — writing them keeps
 * one canonical shape in the document, so a value that came back from an edit
 * compares equal to one that never left.
 */
export function joinInstant({ date, time, offset }: WallClock): string {
  return `${date}T${time}:00${offset}`;
}
