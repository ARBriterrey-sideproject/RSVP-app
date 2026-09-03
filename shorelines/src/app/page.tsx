import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { InviteLanding } from "@/components/invite/InviteLanding";
import { TodayScreen } from "@/components/today/TodayScreen";
import { songRequestsOverride as readSongRequestsOverride } from "@/content/overlay";
import { isWeddingLive, resolveTier } from "@/content/wedding";
import { resolveAsOf } from "@/lib/wedding/asOf";
import { getLiveWeddingSnapshot } from "@/lib/wedding/live";
import { parseRepliedCookie, REPLIED_COOKIE } from "@/lib/guest/replied";

/**
 * The invite link lands here — screen 1b. `?tier=` is an opaque one-letter
 * code (f/w/r) and decides which events the landing promises; the CTA carries
 * the same code through to /rsvp.
 *
 * This is also the route that flips to the "Today" screen once an event window
 * opens. Guests only ever get one link, so the landing has to be the thing that
 * gets replaced rather than something the Today screen sits underneath.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;

  /*
   * The times come from `getLiveWeddingConfig`, not from the config literal, so
   * that a schedule change the couple makes in the dashboard shows here without
   * a rebuild. Reading it in the page rather than inside the component keeps the
   * fetch on the server: everything below this line is rendered from a plain
   * object, and the client never learns Firestore was involved.
   */
  const { config, overlay } = await getLiveWeddingSnapshot();
  const tier = resolveTier(params.tier);
  const songRequestsOverride = readSongRequestsOverride(overlay);

  /*
   * `?asOf=` lets the Today screen be reached and tested before the real
   * wedding window opens — dev-only, since a guest must never be able to fake
   * their way into the live phase. Time still flows forward in real time from
   * this anchor; see TodayScreen's `initialNow` prop.
   */
  const asOf = resolveAsOf(params.asOf);

  if (isWeddingLive(config, asOf)) {
    return (
      <TodayScreen
        tier={tier}
        config={config}
        initialNow={asOf}
        songRequestsOverride={songRequestsOverride}
      />
    );
  }

  /*
   * A guest who has already replied gets the Today screen instead of being
   * asked to RSVP again — the couple's request, after replying and finding the
   * invitation waiting for them the next time they opened the link.
   *
   * Server-side and before the landing renders, so there is no flash of the
   * invitation before the jump. See `lib/guest/replied.ts` for why a cookie is
   * what carries a fact only the client can know. The stored tier in the cookie
   * wins over `?tier=`, the same rule InviteCta follows.
   *
   * Two escape hatches, because this must not make the invitation unreachable:
   * `?invite=1` (what UpcomingScreen's "See the invitation" link sends) and
   * `?asOf=`, which exists to preview the phase flip and would otherwise be
   * swallowed here.
   */
  const replied = parseRepliedCookie((await cookies()).get(REPLIED_COOKIE)?.value);
  if (replied && params.invite === undefined && params.asOf === undefined) {
    redirect(`/today?tier=${replied}`);
  }

  return <InviteLanding tier={tier} config={config} />;
}
