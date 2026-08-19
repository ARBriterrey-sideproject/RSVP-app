"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Eyebrow } from "./ui";

/**
 * Not in lib.dom.d.ts — Chromium's own extension to `Event`, captured so the
 * install can be triggered from our own button instead of a browser toast.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * The install callout on the "done" screen — a per-guest home-screen icon,
 * not a generic one. It only ever appears once `recoveryCode` exists, because
 * the whole point is that the icon it creates reopens *this* reply: the
 * `<link rel="manifest">` it writes into the document points at
 * `/manifest/{recoveryCode}`, whose `start_url` carries the same code (see
 * that route). Nothing here is per-guest beyond that one link; the icon
 * artwork and app name are the same for every guest.
 *
 * Two install paths, because there is no third:
 * - Chromium (Android/desktop) fires `beforeinstallprompt`, which we capture
 *   and replay from our own button — the mockup's styling, not a browser
 *   toast a guest might dismiss without reading.
 * - Safari never fires that event and has no programmatic install; the only
 *   path is the Share sheet, so iOS gets static instructions instead of a
 *   button that would never do anything.
 * Anything else (desktop Safari, Firefox) renders nothing — there is no
 * install affordance to offer, and a card that explains that isn't worth the
 * couple's guests reading past.
 */
export function InstallPrompt({ recoveryCode }: { recoveryCode: string }) {
  const t = useTranslations("rsvp.install");
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(
    null
  );
  // Neither of these changes over the component's lifetime, so each is a lazy
  // initializer rather than an effect computing derived state on mount — the
  // guard is only there because this file is a client component that Next
  // still renders once on the server, where `window` doesn't exist.
  const [isIOS] = useState(() => {
    if (typeof window === "undefined") return false;
    const ua = window.navigator.userAgent;
    return (
      /iphone|ipad|ipod/i.test(ua) ||
      // iPadOS 13+ reports as "Macintosh" unless the desktop-site toggle is
      // off — touch points is the only thing that still tells them apart.
      (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1)
    );
  });
  const [standalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as { standalone?: boolean }).standalone === true
    );
  });

  useEffect(() => {
    function onPrompt(e: Event) {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  useEffect(() => {
    if (standalone) return;
    const link =
      document.querySelector<HTMLLinkElement>('link[rel="manifest"]') ??
      document.head.appendChild(document.createElement("link"));
    link.rel = "manifest";
    const href = `/manifest/${recoveryCode}`;
    link.setAttribute("href", href);
    return () => {
      // Only ever remove the tag we ourselves pointed at this guest's code —
      // never a manifest link some other part of the app might rely on.
      if (link.getAttribute("href") === href) link.remove();
    };
  }, [recoveryCode, standalone]);

  if (standalone || (!isIOS && !deferred)) return null;

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
  }

  return (
    <div className="mt-2.5 rounded-card bg-card p-4 text-left">
      <Eyebrow className="mb-2.5">{t("title")}</Eyebrow>
      <p className="font-sans text-[13px] leading-[1.55] text-driftwood-soft">
        {isIOS ? t("iosBody") : t("body")}
      </p>
      {!isIOS && deferred && (
        <button
          type="button"
          onClick={install}
          className="mt-2.5 font-sans text-xs font-medium uppercase tracking-[0.14em] text-coral-ink"
        >
          {t("cta")}
        </button>
      )}
    </div>
  );
}
