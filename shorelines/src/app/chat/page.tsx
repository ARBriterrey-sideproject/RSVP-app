import { ChatScreen } from "@/components/chat/ChatScreen";
import { EventModeLocked } from "@/components/nav/EventModeLocked";
import { isWeddingLive, resolveTier } from "@/content/wedding";
import { resolveAsOf } from "@/lib/wedding/asOf";
import { getLiveWeddingConfig } from "@/lib/wedding/live";

/**
 * Thin server wrapper — ChatScreen owns the whole viewport, same as /schedule
 * and /rsvp. Chat is an Event-mode feature (see EventModeLocked): there's
 * nothing to talk about before the wedding starts, so this gates on
 * `isWeddingLive` the same way `/` gates Today vs the invite landing.
 */
export default async function ChatPage({ searchParams }: PageProps<"/chat">) {
  const params = await searchParams;
  const tier = resolveTier(params.tier);
  const config = await getLiveWeddingConfig();

  if (!isWeddingLive(config, resolveAsOf(params.asOf))) {
    return <EventModeLocked tier={tier} activeTab="chat" />;
  }

  return <ChatScreen tier={tier} />;
}
