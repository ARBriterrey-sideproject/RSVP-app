"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { tierCode, type Tier } from "@/content/wedding";
import { Eyebrow } from "./ui";

/**
 * The guest's own way back in.
 *
 * Identity here is Anonymous Auth, not a phone number — there is no OTP to
 * re-verify and nothing to "log in" with. The session persists in this
 * browser, but a cleared cache or a second device has no way back to an
 * existing reply without this link. `recoveryCode` is a bearer credential
 * (`recoverRsvp` trades it for a sign-in token with no other check), so this
 * card only ever renders it — the code itself is never sent anywhere except
 * inside a link the guest chose to save.
 */
export function RecoveryLink({
  recoveryCode,
  tier,
}: {
  recoveryCode: string;
  tier: Tier;
}) {
  const t = useTranslations("rsvp.recovery");
  const [copied, setCopied] = useState(false);

  const url =
    typeof window !== "undefined"
      ? `${window.location.origin}/rsvp?tier=${tierCode(tier)}&recover=${recoveryCode}`
      : "";

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Clipboard is blocked outside a secure context. The link is on screen
      // either way, so this fails quietly.
    }
  }

  return (
    <div className="mt-2.5 rounded-card bg-card p-4 text-left">
      <Eyebrow className="mb-2.5">{t("title")}</Eyebrow>
      <p className="font-sans text-[13px] leading-[1.55] text-driftwood-soft">
        {t("body")}
      </p>
      <button
        type="button"
        onClick={copy}
        className="mt-2.5 font-sans text-xs font-medium uppercase tracking-[0.14em] text-coral-ink"
      >
        {copied ? t("copied") : t("copy")}
      </button>
    </div>
  );
}
