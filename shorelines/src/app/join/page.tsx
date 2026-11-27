import { JoinScreen } from "@/components/join/JoinScreen";
import { resolveTier } from "@/content/wedding";

/** Where a guest lands after signing in, when the QR doesn't say otherwise. */
const DEFAULT_NEXT = "/today?tier=f";

/**
 * `?next=` is a same-origin path or nothing: it must start with a single "/"
 * and may not be protocol-relative ("//host") or carry a backslash, which some
 * browsers treat as a slash. Anything else is the default, so the page can't be
 * turned into an open redirect.
 */
function safeNext(value: string | string[] | undefined): string {
  const raw = Array.isArray(value) ? value[0] : value;
  if (
    typeof raw !== "string" ||
    !raw.startsWith("/") ||
    raw.startsWith("//") ||
    raw.includes("\\") ||
    raw.length > 300
  ) {
    return DEFAULT_NEXT;
  }
  return raw;
}

/**
 * The venue QR's destination — not an RSVP. Guests scan a code on a table or
 * a sign, sign in (Google, or a phone OTP for anyone without a Google
 * account) and land inside the live features. One code serves everyone, so
 * there is no tier to carry; the post-sign-in route supplies its own.
 *
 * Deliberately no live-config read: nothing here depends on times or events.
 */
export default async function JoinPage({ searchParams }: PageProps<"/join">) {
  const params = await searchParams;
  return (
    <JoinScreen next={safeNext(params.next)} tier={resolveTier(params.tier)} />
  );
}
