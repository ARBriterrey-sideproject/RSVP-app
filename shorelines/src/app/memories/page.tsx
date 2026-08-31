import { MemoriesComposer } from "@/components/memories/MemoriesComposer";
import { resolveTier } from "@/content/wedding";

/**
 * Not event-gated, unlike Chat and Photos.
 *
 * A private note to the couple doesn't need the wedding to have started — the
 * rules agree: `memories` create is gated on `isSignedIn()` and an owning uid
 * with no time condition, so nothing server-side ever enforced the wedding
 * window here. It's the one live-wedding feature `UpcomingScreen` links to.
 *
 * Reached only from links on the Today screens, so it has no tab bar of its own.
 */
export default async function MemoriesPage({ searchParams }: PageProps<"/memories">) {
  const params = await searchParams;
  return <MemoriesComposer tier={resolveTier(params.tier)} />;
}
