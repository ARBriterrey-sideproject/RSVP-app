import { InviteLanding } from "@/components/invite/InviteLanding";
import { resolveTier } from "@/content/wedding";

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
  return <InviteLanding tier={resolveTier(params.tier)} />;
}
