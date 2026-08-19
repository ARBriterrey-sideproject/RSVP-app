import { ScheduleScreen } from "@/components/schedule/ScheduleScreen";
import { isWeddingLive, resolveTier } from "@/content/wedding";
import { resolveAsOf } from "@/lib/wedding/asOf";
import { getLiveWeddingConfig } from "@/lib/wedding/live";

/**
 * Screen 1d. Reached from the bottom tab bar, carrying the same opaque tier
 * code the guest arrived with — see `rsvp/page.tsx` for why this stays a
 * thin wrapper: ScheduleScreen owns a fixed-height app viewport of its own.
 */
export default async function SchedulePage({
  searchParams,
}: PageProps<"/schedule">) {
  const params = await searchParams;
  const config = await getLiveWeddingConfig();

  return (
    <ScheduleScreen
      tier={resolveTier(params.tier)}
      config={config}
      live={isWeddingLive(config, resolveAsOf(params.asOf))}
    />
  );
}
