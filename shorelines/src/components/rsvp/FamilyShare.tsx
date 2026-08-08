"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { COUPLE } from "@/content/wedding";
import { Eyebrow } from "./ui";

/**
 * The family QR.
 *
 * The problem it solves: one person RSVPs for the whole household, and then a
 * cousin opens the same WhatsApp link and starts a second, duplicate reply.
 * Rather than police that, we give the person who replied something better to
 * forward — a code that opens the invitation read-only, showing the schedule
 * and the reply that was already sent, with no form attached. There is nothing
 * to duplicate because there is nothing to submit.
 *
 * The code is a capability: whoever holds it can read the page. That is why the
 * callable puts only names and event choices behind it — no phone number, no
 * travel plans, no notes, and never an invitation-only event.
 */
export function FamilyShare({ shareCode }: { shareCode: string }) {
  const t = useTranslations("rsvp.share");
  const link = useShareLink(shareCode);
  const [copied, setCopied] = useState(false);

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.url);
      setCopied(true);
    } catch {
      // Clipboard is blocked outside a secure context (plain http on a phone,
      // for one). The link is on screen either way, so this fails quietly.
    }
  }

  return (
    <div className="mt-2.5 rounded-card bg-card p-4 text-left">
      <Eyebrow className="mb-2.5">{t("title")}</Eyebrow>

      <div className="flex items-center gap-4">
        {/* Fixed box either way: letting the layout settle when the QR resolves
            makes the whole card jump a beat after the screen appears. */}
        <div className="grid size-[108px] flex-none place-items-center rounded-[14px] bg-white p-2">
          {link?.qr ? (
            /* A data URI we already hold in memory; next/image would only add
               a loader round trip to bytes that are right here. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={link.qr}
              alt={t("qrAlt", {
                partnerA: COUPLE.partnerA,
                partnerB: COUPLE.partnerB,
              })}
              className="size-full"
            />
          ) : (
            <span className="sr-only">{t("preparing")}</span>
          )}
        </div>

        <div className="min-w-0">
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
      </div>
    </div>
  );
}

/**
 * The share URL and its QR, resolved together.
 *
 * The origin is read from the browser rather than a configured base URL,
 * because there isn't one yet — the domain is still an open question, and on
 * the emulator the app is reached by LAN IP as often as by localhost. Whatever
 * host the guest is on is the host their family can reach.
 *
 * Both land in one piece of state on purpose: the URL is only knowable in the
 * browser, so a separate hook for it would mean a setState in an effect body
 * and a cascading render on every mount.
 */
function useShareLink(
  shareCode: string
): { url: string; qr: string | null } | null {
  const [link, setLink] = useState<{ url: string; qr: string | null } | null>(
    null
  );

  useEffect(() => {
    let live = true;
    const url = `${window.location.origin}/i/${shareCode}`;

    QRCode.toDataURL(url, {
      margin: 1,
      width: 320,
      errorCorrectionLevel: "M",
      // Deeptide on white. Anything lighter than this stops scanning reliably
      // off a phone screen at an angle, which is exactly how it gets used.
      color: { dark: "#1F6F73FF", light: "#FFFFFFFF" },
    })
      .then((qr) => {
        if (live) setLink({ url, qr });
      })
      .catch(() => {
        // No QR is survivable — the copyable link is right beside it.
        if (live) setLink({ url, qr: null });
      });

    return () => {
      live = false;
    };
  }, [shareCode]);

  return link;
}
