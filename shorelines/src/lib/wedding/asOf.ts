/**
 * Dev-only `?asOf=` parsing, shared by every guest route that needs to test a
 * phase flip — the Today/InviteLanding flip on `/`, and the RSVP-mode/Event-mode
 * gate on `/chat`, `/photos`, `/memories`, `/polls`. A guest must never be able to
 * fake their way into a later phase, so this is a no-op outside development.
 */
export function resolveAsOf(raw: string | string[] | undefined): Date | undefined {
  if (process.env.NODE_ENV === "production") return undefined;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = value ? new Date(value) : undefined;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
}
