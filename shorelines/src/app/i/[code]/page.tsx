import { SharedInvite } from "@/components/invite/SharedInvite";

/**
 * Where a scanned family QR lands: the invitation, read-only.
 *
 * The `code` is a capability minted by the submitRsvp callable, so this route
 * is deliberately open — a cousin holding a phone camera has no account and
 * can't be asked to sign in. What keeps that safe is on the other side: the
 * document the code opens carries names and event choices only, and never an
 * invitation-only event.
 *
 * `/i/` rather than `/invite/` because this gets typed off a printed card as
 * often as it gets scanned.
 */
export default async function SharedInvitePage({
  params,
}: PageProps<"/i/[code]">) {
  const { code } = await params;
  return <SharedInvite shareCode={code} />;
}
