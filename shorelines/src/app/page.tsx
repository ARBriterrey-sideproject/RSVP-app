import { InviteLanding } from "@/components/invite/InviteLanding";
import { resolveTier } from "@/content/wedding";
import { getLiveWeddingConfig } from "@/lib/wedding/live";

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
  return (
    <InviteLanding
      tier={resolveTier(params.tier)}
      config={await getLiveWeddingConfig()}
    />
  );
}
