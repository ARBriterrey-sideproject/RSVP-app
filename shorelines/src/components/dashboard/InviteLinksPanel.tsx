"use client";

import { useState } from "react";
import { rsvpHref } from "@/content/wedding";
import type { Tier } from "@/content/wedding";
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
      </div>
    </div>
  );
}
