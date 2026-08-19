import { RsvpFlow } from "@/components/rsvp/RsvpFlow";
import { isWeddingLive, resolveTier } from "@/content/wedding";
import { resolveAsOf } from "@/lib/wedding/asOf";
import { getLiveWeddingConfig } from "@/lib/wedding/live";

/**
 * Screen 1c. Reached from the landing's CTA, which passes the same opaque
 * tier code along — a guest arriving here with no code gets `full`.
 *
 * `?recover=` carries a one-time recovery code minted by `submitRsvp` — read
 * server-side here, alongside `tier`, and handed to RsvpFlow to exchange for a
 * sign-in token on mount. It is a bearer credential, so RsvpFlow strips it
 * from the address bar once it's been read.
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
  const config = await getLiveWeddingConfig();

  return (
    <RsvpFlow
      tier={resolveTier(params.tier)}
      config={config}
      recoverCode={
        typeof params.recover === "string" ? params.recover : null
      }
      live={isWeddingLive(config, resolveAsOf(params.asOf))}
    />
  );
}
