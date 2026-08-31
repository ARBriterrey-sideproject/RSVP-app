import { TodayScreen } from "@/components/today/TodayScreen";
import { UpcomingScreen } from "@/components/today/UpcomingScreen";
import { songRequestsOverride as readSongRequestsOverride } from "@/content/overlay";
import { isWeddingLive, resolveTier } from "@/content/wedding";
import { resolveAsOf } from "@/lib/wedding/asOf";
import { getLiveWeddingSnapshot } from "@/lib/wedding/live";

/**
 * The Today tab's destination, all year round.
 *
 * `/` keeps its own flip — it is still the invite that becomes the live screen
 * on the day, so "one app, one link, two phases" is untouched. This route
 * exists because the tab bar showed a Today tab from the moment the invite went
 * out and pointed it at `/`, which before the window opens is the landing the
 * guest just came from. Inside the window it renders the same `TodayScreen`;
 * outside it, the light `UpcomingScreen`.
 *
 * `?asOf=` is honoured here for the same dev-only reason as on `/` — it's how
 * the live branch is reachable before December.
 */
export default async function Today({ searchParams }: PageProps<"/today">) {
  const params = await searchParams;

  const { config, overlay } = await getLiveWeddingSnapshot();
  const tier = resolveTier(params.tier);
  const asOf = resolveAsOf(params.asOf);

  if (isWeddingLive(config, asOf)) {
    return (
      <TodayScreen
        tier={tier}
        config={config}
        initialNow={asOf}
        songRequestsOverride={readSongRequestsOverride(overlay)}
      />
    );
  }

  return <UpcomingScreen tier={tier} config={config} initialNow={asOf} />;
}
