import { RsvpFlow } from "@/components/rsvp/RsvpFlow";
import { resolveTier } from "@/content/wedding";
import { getLiveWeddingConfig } from "@/lib/wedding/live";

/**
 * Screen 1c. Reached from the landing's CTA, which passes the same opaque
 * tier code along — a guest arriving here with no code gets `full`.
 *
 * The page is a thin wrapper on purpose: 1c is a fixed-height app layout with
 * its own header and sticky footer, so RsvpFlow owns the viewport and there is
 * nothing to wrap it in.
 */
export default async function RsvpPage({ searchParams }: PageProps<"/rsvp">) {
  const params = await searchParams;

  /*
   * The live config is resolved here, on the server, and handed to the flow as
   * a prop. RsvpFlow is a client component and needs the events to render the
   * day-picker, so this is the boundary where the merge has to have happened —
   * a guest picking days must be picking the times the couple last set, not the
   * ones compiled into the bundle.
   */
  return (
    <RsvpFlow
      tier={resolveTier(params.tier)}
      config={await getLiveWeddingConfig()}
    />
  );
}
