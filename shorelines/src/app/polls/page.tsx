import { PollsScreen } from "@/components/polls/PollsScreen";
import { EventModeLocked } from "@/components/nav/EventModeLocked";
import { isWeddingLive, resolveTier } from "@/content/wedding";
import { resolveAsOf } from "@/lib/wedding/asOf";
import { getLiveWeddingConfig } from "@/lib/wedding/live";

/** Event-mode gated — see EventModeLocked. Reached only from links on TodayScreen, so it has no tab bar of its own. */
export default async function PollsPage({ searchParams }: PageProps<"/polls">) {
  const params = await searchParams;
  const tier = resolveTier(params.tier);
  const config = await getLiveWeddingConfig();

  if (!isWeddingLive(config, resolveAsOf(params.asOf))) {
    return <EventModeLocked tier={tier} />;
  }

  return <PollsScreen tier={tier} />;
}
