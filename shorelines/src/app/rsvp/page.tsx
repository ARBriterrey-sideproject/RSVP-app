import { RsvpFlow } from "@/components/rsvp/RsvpFlow";
import { resolveTier } from "@/content/wedding";

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
  return <RsvpFlow tier={resolveTier(params.tier)} />;
}
