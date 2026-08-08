"use client";

import { useLocale, useTranslations } from "next-intl";
import { useTransition } from "react";
import { setUserLocale } from "@/i18n/locale";
import { LOCALES, LOCALE_NAMES, isLocale, type Locale } from "@/i18n/locales";

/**
 * Four names in four scripts, always all visible — not a dropdown.
 *
 * A guest who reads only Odia can't be expected to open a control labelled in
 * English to find out it contains their language. Showing every option in its
 * own script means the right one is recognisable without reading anything else
 * on the screen, and with four languages it costs one row.
 *
 * Changing the language re-renders from the server, because the messages live
 * there. `useTransition` keeps the old text on screen during that round trip
 * instead of flashing a fallback.
 *
 * `tone` exists because this sits on two very different backgrounds: sand
 * (everywhere) and the teal hero on the landing. The sand palette's inactive
 * grey is unreadable over deeptide, so the ocean variant inverts to foam.
 */
const TONES = {
  sand: {
    active: "bg-deeptide text-foam",
    idle: "text-driftwood-soft hover:bg-shell",
  },
  ocean: {
    active: "bg-[rgba(255,249,240,0.92)] text-deeptide",
    idle: "text-[rgba(251,246,238,0.75)] hover:bg-[rgba(255,249,240,0.18)]",
  },
} as const;

export function LanguageSwitcher({
  className = "",
  tone = "sand",
}: {
  className?: string;
  tone?: keyof typeof TONES;
}) {
  const active = useLocale();
  const t = useTranslations("language");
  const [pending, startTransition] = useTransition();

  function choose(locale: Locale) {
    if (locale === active) return;
    startTransition(async () => {
      await setUserLocale(locale);
    });
  }

  return (
    <div
      className={`flex flex-wrap items-center gap-x-1 gap-y-1.5 ${className}`}
      role="group"
      aria-label={t("change")}
    >
      {LOCALES.map((locale) => {
        const current = isLocale(active) && active === locale;
        return (
          <button
            key={locale}
            type="button"
            lang={locale}
            onClick={() => choose(locale)}
            aria-current={current ? "true" : undefined}
            disabled={pending}
            className={[
              "rounded-pill px-2.5 py-1 font-sans text-[12.5px] leading-none transition-colors",
              current ? TONES[tone].active : TONES[tone].idle,
              pending ? "opacity-60" : "",
            ].join(" ")}
          >
            {LOCALE_NAMES[locale]}
          </button>
        );
      })}
    </div>
  );
}
