"use client";

import { useState } from "react";
import { COUPLE, rsvpHref } from "@/content/wedding";
import type { Tier } from "@/content/wedding";
import { qrDataUrl, useLinkQr } from "@/lib/qr";
import { PanelNote } from "./panelKit";

/**
 * THE THREE LINKS, READY TO PASTE.
 *
 * v1 has no WhatsApp API — the couple sends these by hand, so the one job of
 * this panel is turning "which tier is which link" into a single tap.
 */

const TIERS: { tier: Tier; label: string; description: string }[] = [
  { tier: "full", label: "Full invite", description: "All five events." },
  {
    tier: "wedding_only",
    label: "Wedding only",
    description: "Just the wedding ceremony.",
  },
  {
    tier: "reception_only",
    label: "Reception only",
    description: "Just the reception.",
  },
];

const VENUE_LINE = "Scan to join chat, photos, polls & song requests";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * THE VENUE QR.
 *
 * One code for every guest, printed and stood around the venue on the day. It
 * isn't an RSVP link — it opens `/join`, which signs the guest in (Google, or a
 * phone code) and drops them into the live features. Error correction is high
 * because a printed code gets creased, stood in sunlight and photographed at
 * an angle.
 */
function VenueQrCard() {
  const link = useLinkQr("/join", { width: 320, level: "H" });
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // The link is on screen — a manual copy is always possible.
    }
  }

  async function print1024(): Promise<string | null> {
    if (!link) return null;
    try {
      return await qrDataUrl(link.url, { width: 1024, level: "H" });
    } catch {
      return null;
    }
  }

  async function download() {
    setBusy(true);
    const png = await print1024();
    setBusy(false);
    if (!png) return;
    const a = document.createElement("a");
    a.href = png;
    a.download = "venue-qr.png";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  async function print() {
    // Opened synchronously so the popup blocker sees a user gesture; filled in
    // once the high-resolution code has rendered.
    const win = window.open("", "_blank", "width=800,height=1000");
    if (!win) return;
    setBusy(true);
    const png = await print1024();
    setBusy(false);
    if (!png) {
      win.close();
      return;
    }
    const names = `${escapeHtml(COUPLE.partnerA)} &amp; ${escapeHtml(COUPLE.partnerB)}`;
    win.document.open();
    win.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>Venue QR</title>
<style>
  @page { margin: 18mm; }
  html, body { margin: 0; height: 100%; }
  body { display: flex; flex-direction: column; align-items: center; justify-content: center;
    font-family: Georgia, "Times New Roman", serif; color: #1F6F73; text-align: center; gap: 28px; }
  h1 { font-size: 44px; font-weight: 400; margin: 0; letter-spacing: 0.02em; }
  img { width: 420px; max-width: 80vw; height: auto; }
  p { font-family: Helvetica, Arial, sans-serif; font-size: 20px; margin: 0; color: #4a4741; max-width: 420px; line-height: 1.4; }
</style></head>
<body>
  <h1>${names}</h1>
  <img src="${png}" alt="QR code">
  <p>${escapeHtml(VENUE_LINE)}</p>
  <script>
    var img = document.querySelector("img");
    function go() { window.focus(); window.print(); }
    if (img.complete) go(); else img.onload = go;
  </script>
</body></html>`);
    win.document.close();
  }

  return (
    <div className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50">
      <p className="font-sans text-[14px] font-medium text-driftwood">
        Venue QR
      </p>
      <p className="mt-0.5 font-sans text-[12px] text-driftwood-soft">
        One code for everyone, for the day itself. Guests sign in with Google
        (or a phone code) and land in chat, photos, polls and song requests.
        It is not an RSVP link.
      </p>

      <div className="mt-3 flex justify-center rounded-card bg-card p-3">
        {link?.qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={link.qr}
            alt="QR code for the venue sign-in link"
            width={200}
            height={200}
            className="size-[200px] rounded-md bg-white"
          />
        ) : (
          <div className="grid size-[200px] place-items-center font-sans text-[12px] text-driftwood-faint">
            {link ? "Couldn't draw the code" : "Drawing…"}
          </div>
        )}
      </div>

      <p className="mt-2 break-all rounded-card bg-card px-3 py-2 font-mono text-[12px] text-driftwood-soft">
        {link?.url ?? "/join"}
      </p>

      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy()}
          disabled={!link}
          className="rounded-pill bg-coral px-4 py-2 font-sans text-[13px] font-medium text-foam transition-colors hover:bg-coral-deep disabled:opacity-50"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={() => void download()}
          disabled={!link || busy}
          className="rounded-pill bg-card px-4 py-2 font-sans text-[13px] font-medium text-deeptide transition-colors hover:bg-card-hover disabled:opacity-50"
        >
          Download PNG
        </button>
        <button
          type="button"
          onClick={() => void print()}
          disabled={!link || busy}
          className="rounded-pill bg-card px-4 py-2 font-sans text-[13px] font-medium text-deeptide transition-colors hover:bg-card-hover disabled:opacity-50"
        >
          Print
        </button>
      </div>
    </div>
  );
}

export function InviteLinksPanel() {
  const [copied, setCopied] = useState<Tier | null>(null);

  function absoluteHref(tier: Tier): string {
    const path = rsvpHref(tier);
    if (typeof window === "undefined") return path;
    return `${window.location.origin}${path}`;
  }

  async function copy(tier: Tier) {
    const href = absoluteHref(tier);
    try {
      await navigator.clipboard.writeText(href);
      setCopied(tier);
      setTimeout(() => setCopied((current) => (current === tier ? null : current)), 2000);
    } catch {
      // Clipboard access can be denied by the browser — the link is still
      // shown on screen, so a manual copy is always possible.
    }
  }

  return (
    <div className="mt-3">
      <PanelNote>
        Each link opens the same app with a different invite. Paste the right
        one into each chat — the tier can&apos;t be changed once someone
        replies.
      </PanelNote>

      <div className="mt-4 flex flex-col gap-3">
        {TIERS.map(({ tier, label, description }) => (
          <div
            key={tier}
            className="rounded-card bg-white p-3.5 ring-1 ring-hairline/50"
          >
            <p className="font-sans text-[14px] font-medium text-driftwood">
              {label}
            </p>
            <p className="mt-0.5 font-sans text-[12px] text-driftwood-soft">
              {description}
            </p>
            <p className="mt-2 break-all rounded-card bg-card px-3 py-2 font-mono text-[12px] text-driftwood-soft">
              {absoluteHref(tier)}
            </p>
            <button
              type="button"
              onClick={() => void copy(tier)}
              className="mt-2 rounded-pill bg-coral px-4 py-2 font-sans text-[13px] font-medium text-foam transition-colors hover:bg-coral-deep"
            >
              {copied === tier ? "Copied" : "Copy link"}
            </button>
          </div>
        ))}
        <VenueQrCard />
      </div>
    </div>
  );
}
