/**
 * A one-bit breadcrumb saying "this browser has already replied", and which
 * tier it replied on.
 *
 * The couple asked that a guest who has RSVPed land on the Today screen next
 * time rather than on the invitation again. Only the client can answer "has
 * this guest replied?" — the answer lives in Firestore behind a Firebase Auth
 * session, which is browser state the server never sees. But the *decision*
 * has to be made on the server: making it after hydration means rendering the
 * whole invitation and then yanking it away half a second later, which is a
 * worse first impression than the thing we set out to fix.
 *
 * So the client writes what it learns into a cookie, and `/` reads that cookie
 * server-side and redirects before a byte of the landing is sent. The lag is
 * one visit for a guest who replied before this shipped; every guest who
 * replies from now on gets the cookie written on the confirmation screen.
 *
 * WHAT THIS IS NOT: a credential. It carries no uid, no phone number and no
 * code — only a tier letter that is already in the guest's own URL, and which
 * `submitRsvp` fixes server-side at first submission regardless. Anyone who
 * forges it gets sent to a Today screen that reads their real reply (or tells
 * them they haven't replied). Nothing is gated on it.
 *
 * It is deliberately readable by JS (no `HttpOnly`) because the client is the
 * only writer, and `SameSite=Lax` so a forwarded WhatsApp link still carries it.
 */

import type { TierCode } from "@/content/wedding";

/**
 * The cookie holds a tier letter and nothing else. Aliased off `TierCode`
 * rather than re-spelled, so adding a fourth tier can't leave this behind.
 */
export type RepliedCookieValue = TierCode;

export const REPLIED_COOKIE = "shorelines_replied";

/** A year. The wedding is inside that window and so is every reminder round. */
const MAX_AGE = 60 * 60 * 24 * 365;

function isTierCode(value: string): value is RepliedCookieValue {
  return value === "f" || value === "w" || value === "r";
}

/** Read on the server; returns null for anything we didn't write. */
export function parseRepliedCookie(
  value: string | undefined
): RepliedCookieValue | null {
  if (!value) return null;
  return isTierCode(value) ? value : null;
}

export function markReplied(tierCode: RepliedCookieValue): void {
  if (typeof document === "undefined") return;
  document.cookie = `${REPLIED_COOKIE}=${tierCode};path=/;max-age=${MAX_AGE};SameSite=Lax`;
}

/**
 * Called when the lookup settles to "no reply" — a guest whose reply staff
 * deleted, or who signed out, must not be bounced past the invitation forever.
 * Self-healing beats an accurate-at-write-time flag nobody clears.
 */
export function clearReplied(): void {
  if (typeof document === "undefined") return;
  document.cookie = `${REPLIED_COOKIE}=;path=/;max-age=0;SameSite=Lax`;
}
