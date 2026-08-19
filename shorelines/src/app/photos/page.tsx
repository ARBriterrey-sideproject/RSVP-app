import { PhotoUploadScreen } from "@/components/photos/PhotoUploadScreen";
import { EventModeLocked } from "@/components/nav/EventModeLocked";
import { isWeddingLive, resolveTier } from "@/content/wedding";
import { resolveAsOf } from "@/lib/wedding/asOf";
import { getLiveWeddingConfig } from "@/lib/wedding/live";

/** Event-mode gated — see EventModeLocked and ChatPage's comment. */
export default async function PhotosPage({ searchParams }: PageProps<"/photos">) {
  const params = await searchParams;
  const tier = resolveTier(params.tier);
  const config = await getLiveWeddingConfig();

  if (!isWeddingLive(config, resolveAsOf(params.asOf))) {
    return <EventModeLocked tier={tier} activeTab="photos" />;
  }

  return <PhotoUploadScreen tier={tier} />;
}
