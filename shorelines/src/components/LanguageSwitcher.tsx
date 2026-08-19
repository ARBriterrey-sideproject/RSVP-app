"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { setUserLocale } from "@/i18n/locale";
import {
  LOCALES,
  LOCALE_NAMES,
  LOCALE_SHORT,
  isLocale,
  type Locale,
} from "@/i18n/locales";

/**
 * A single round trigger, not a row of four pills — the row wrapped awkwardly
 * wherever space was tight (the hero corner, the identity step) because
 * "English" is a much wider label than the other three.
 *
 * The old row kept every language visible at once specifically so a guest who
 * reads only Odia could recognise their own script without first reading a
 * label in a language they don't. A single collapsed trigger loses that
 * unless it earns it back some other way — so while closed, the trigger
 * itself cycles through every language's own short form on a timer. A guest
 * only has to glance at it for a few seconds, not already know which control
 * to tap. Tapping it freezes on the current language and opens the full list.
 *
 * `tone` still exists for the same reason as before: sand everywhere, ocean
 * on the teal hero.
 */
const TONES = {
  sand: {
    trigger: "bg-card text-driftwood",
    optionHover: "hover:bg-card-hover",
    optionActive: "bg-deeptide text-foam",
    badgeIdle: "bg-driftwood/8",
    badgeActive: "bg-foam/20",
  },
  ocean: {
    trigger: "bg-[rgba(255,249,240,0.92)] text-deeptide",
    optionHover: "hover:bg-card-hover",
    optionActive: "bg-deeptide text-foam",
    badgeIdle: "bg-driftwood/8",
    badgeActive: "bg-foam/20",
  },
} as const;

const CYCLE_MS = 1800;

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
  const [open, setOpen] = useState(false);
  const [cycle, setCycle] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) return;
    const id = setInterval(() => setCycle((c) => c + 1), CYCLE_MS);
    return () => clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(locale: Locale) {
    setOpen(false);
    if (locale === active) return;
    startTransition(async () => {
      await setUserLocale(locale);
    });
  }

  // Frozen on the guest's own language while open or mid-transition; cycling
  // is only for the closed, undecided state.
  const shownLocale: Locale =
    open || pending
      ? isLocale(active)
        ? active
        : "en"
      : LOCALES[cycle % LOCALES.length];

  return (
    <div ref={rootRef} className={`relative flex ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("change")}
        disabled={pending}
        className={`flex size-9 flex-none items-center justify-center overflow-hidden rounded-full font-sans text-[12px] font-semibold transition-colors active:scale-95 ${TONES[tone].trigger} ${pending ? "opacity-60" : ""}`}
      >
        <AnimatePresence initial={false}>
          <motion.span
            key={shownLocale}
            lang={shownLocale}
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -5, position: "absolute" }}
            transition={{ duration: 0.22 }}
          >
            {LOCALE_SHORT[shownLocale]}
          </motion.span>
        </AnimatePresence>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            aria-label={t("change")}
            initial={{ opacity: 0, scale: 0.92, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.94, y: -4 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-[calc(100%+8px)] z-40 min-w-[160px] overflow-hidden rounded-card bg-card p-1.5 shadow-[0_14px_32px_rgba(15,62,64,0.22)]"
          >
            {LOCALES.map((locale) => {
              const current = isLocale(active) && active === locale;
              return (
                <button
                  key={locale}
                  type="button"
                  role="option"
                  aria-selected={current}
                  lang={locale}
                  onClick={() => choose(locale)}
                  disabled={pending}
                  className={`flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left font-sans text-[13.5px] transition-colors ${
                    current
                      ? TONES[tone].optionActive
                      : `text-driftwood ${TONES[tone].optionHover}`
                  }`}
                >
                  <span
                    className={`flex size-6 flex-none items-center justify-center rounded-full text-[10.5px] font-semibold ${
                      current ? TONES[tone].badgeActive : TONES[tone].badgeIdle
                    }`}
                  >
                    {LOCALE_SHORT[locale]}
                  </span>
                  {LOCALE_NAMES[locale]}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
