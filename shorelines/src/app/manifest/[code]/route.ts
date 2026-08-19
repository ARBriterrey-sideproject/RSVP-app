import { APP_NAME } from "@/content/wedding";

/**
 * A per-guest web app manifest, minted the moment a guest lands on the "done"
 * screen — never generic. `start_url` carries their own `recoveryCode`, so
 * the home-screen icon this manifest is attached to reopens their own reply
 * on this device, not a blank invite. See InstallPrompt, which is the only
 * place a `<link rel="manifest">` pointing here is ever written into the DOM.
 *
 * Deliberately stateless: this never touches Firestore. `recoverRsvp` is
 * what actually validates a code, at the moment the guest opens the icon —
 * this route only has to interpolate a string, so a guest who never installs
 * costs nothing beyond the one request that renders this JSON.
 *
 * The code comes straight from `newRecoveryCode()` in the callable (20 chars,
 * a fixed unambiguous alphabet — see functions/src/index.ts) — checked here
 * against that same shape rather than trusted, since it lands in a URL inside
 * a JSON response.
 */
const RECOVERY_CODE_PATTERN = /^[a-hj-km-np-z2-9]{1,24}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> }
) {
  const { code } = await params;
  if (!RECOVERY_CODE_PATTERN.test(code)) {
    return new Response("Not found", { status: 404 });
  }

  const manifest = {
    name: APP_NAME,
    short_name: APP_NAME,
    description: "Your invitation and your reply, saved.",
    start_url: `/rsvp?recover=${code}`,
    scope: "/",
    display: "standalone",
    background_color: "#fbf6ee",
    theme_color: "#1f6f73",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };

  return Response.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json",
      // Bearer credential in the URL, minted per-guest — never a shared cache.
      "Cache-Control": "private, no-store",
    },
  });
}
