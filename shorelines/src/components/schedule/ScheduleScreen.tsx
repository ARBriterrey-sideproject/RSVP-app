"use client";

/**
 * Screen 1d, "The schedule" — identity file lines 453-602.
 *
 * A day-tab row jumps down a single scrolling timeline, grouped by calendar
 * day in the wedding's own time zone (`dayKey`), merging ceremonies and meals
 * (`scheduleTimeline`) so a lunch inside the Haldi window sits where it
 * actually falls rather than after every event card.
 *
 * Client, not server, for the same reason `RsvpFlow` is: the speakeasy can
 * only be revealed once a guest's own Firestore document has been read back,
 * and that read has to happen after the tier link resolves, not off it.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import {
  ACCENT_FILL,
  ACCENT_TINT,
  dayKey,
  eventsForGuest,
  isTier,
  mealsForEvents,
  scheduleTimeline,
  type Tier,
  type TimelineEntry,
  type WeddingConfig,
  type WeddingEvent,
} from "@/content/wedding";
import { eventCopy, scheduleCopy, type Lookup } from "@/i18n/weddingCopy";
import {
  BOTTOM_TAB_BAR_HEIGHT,
  BottomTabBar,
} from "@/components/nav/BottomTabBar";
import { SingleWave } from "@/components/motifs";

function timeParts(iso: string, locale: string, timeZone: string) {
  const parts = new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone,
  }).formatToParts(new Date(iso));
  let main = "";
  let meridiem = "";
  for (const part of parts) {
    if (part.type === "dayPeriod") meridiem = part.value;
    else if (part.type !== "literal" || part.value.trim() !== "")
      main += part.value;
  }
  return { main: main.trim(), meridiem };
}

function TimeCol({ at, locale, timeZone }: { at: string; locale: string; timeZone: string }) {
  const { main, meridiem } = timeParts(at, locale, timeZone);
  return (
    <div className="w-[52px] flex-none pt-1 text-right">
      <div className="font-sans text-[12.5px] font-medium leading-tight text-driftwood">
        {main}
      </div>
      <div className="font-sans text-[9.5px] uppercase tracking-wide text-driftwood-faint">
        {meridiem}
      </div>
    </div>
  );
}

function ConnectorCol({ tone }: { tone: "minor" | "event" | "wedding" }) {
  const dot =
    tone === "wedding"
      ? "size-[11px] bg-deeptide shadow-[0_0_0_5px_rgba(31,111,115,0.18)]"
      : tone === "event"
        ? "size-[9px] bg-deeptide"
        : "size-[6px] bg-hairline";
  return (
    <div className="relative w-[18px] flex-none self-stretch">
      <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-hairline" />
      <span
        className={`absolute left-1/2 top-2 -translate-x-1/2 rounded-full ${dot}`}
      />
    </div>
  );
}

function EventCard({
  event,
  t,
  locale,
  timeZone,
}: {
  event: WeddingEvent;
  t: Lookup;
  locale: string;
  timeZone: string;
}) {
  const copy = eventCopy(t, event);
  const highlightTime = event.highlight
    ? timeParts(event.highlight.at, locale, timeZone)
    : null;

  return (
    <div className="relative overflow-hidden rounded-card bg-card px-4 py-4">
      <div
        className={`absolute -right-4 -top-4 size-20 rounded-full opacity-[0.12] ${ACCENT_FILL[event.accent]}`}
      />
      <p className="relative font-display text-[27px] leading-none text-driftwood">
        {copy.name}
      </p>
      <p className="relative mt-1.5 font-sans text-[12.5px] text-driftwood-soft">
        {copy.daypart} · {copy.venueShort}
      </p>
      <div className="relative mt-2.5 flex flex-wrap gap-1.5">
        <span
          className={`rounded-pill px-2.5 py-1 font-sans text-[10.5px] font-medium text-driftwood ${ACCENT_TINT[event.accent]}`}
        >
          {copy.dressCode}
        </span>
        {copy.highlightLabel && highlightTime && (
          <span className="rounded-pill bg-warmgold/15 px-2.5 py-1 font-sans text-[10.5px] font-medium text-clay">
            {copy.highlightLabel} · {highlightTime.main} {highlightTime.meridiem}
          </span>
        )}
      </div>
    </div>
  );
}

function WeddingCard({
  event,
  t,
  locale,
  timeZone,
  mainEventLabel,
}: {
  event: WeddingEvent;
  t: Lookup;
  locale: string;
  timeZone: string;
  mainEventLabel: string;
}) {
  const copy = eventCopy(t, event);
  const highlightTime = event.highlight
    ? timeParts(event.highlight.at, locale, timeZone)
    : null;

  return (
    <div className="relative overflow-hidden rounded-card bg-[linear-gradient(160deg,var(--color-deeptide)_0%,var(--color-shallows-bright)_60%,var(--color-warmgold)_100%)] px-5 py-6 text-foam">
      <div className="animate-tide pointer-events-none absolute inset-0 bg-[radial-gradient(55%_60%_at_30%_30%,rgba(255,255,255,0.35),transparent_70%)]" />
      <p className="relative font-sans text-[10.5px] font-semibold uppercase tracking-[0.32em] text-foam/80">
        {mainEventLabel}
      </p>
      <p className="relative mt-2 font-display text-[38px] leading-none">
        {copy.name}
      </p>
      <p className="relative mt-2 font-sans text-[13px] text-foam/85">
        {copy.daypart} · {copy.venueShort}
      </p>
      <div className="relative mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-pill bg-white/20 px-2.5 py-1 font-sans text-[10.5px] font-medium text-foam">
          {copy.dressCode}
        </span>
        {copy.highlightLabel && highlightTime && (
          <span className="rounded-pill bg-white/20 px-2.5 py-1 font-sans text-[10.5px] font-medium text-foam">
            {copy.highlightLabel} · {highlightTime.main} {highlightTime.meridiem}
          </span>
        )}
      </div>
    </div>
  );
}

function MealRow({ entry, t }: { entry: Extract<TimelineEntry, { kind: "meal" }>; t: Lookup }) {
  const copy = scheduleCopy(t, entry.item);
  return (
    <p className="pt-1.5 font-sans text-[13.5px] leading-[1.5] text-driftwood-soft">
      {copy.name}
      {copy.note ? ` · ${copy.note}` : ""}
    </p>
  );
}

function DaySection({
  entries,
  locale,
  timeZone,
  t,
  mainEventLabel,
  signOff,
  registerRef,
}: {
  entries: TimelineEntry[];
  locale: string;
  timeZone: string;
  t: Lookup;
  mainEventLabel: string;
  signOff: string | null;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const heading = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(new Date(entries[0].at));

  return (
    <div ref={registerRef} className="scroll-mt-6">
      <h2 className="font-serif text-[19px] font-medium text-deeptide">
        {heading}
      </h2>
      <SingleWave className="mt-2 mb-4 h-2 w-14 text-driftwood-faint opacity-70" />

      <div className="flex flex-col">
        {entries.map((entry) => {
          if (entry.kind === "meal") {
            return (
              <div key={`meal-${entry.item.id}`} className="flex gap-3 pb-3">
                <TimeCol at={entry.at} locale={locale} timeZone={timeZone} />
                <ConnectorCol tone="minor" />
                <div className="flex-1">
                  <MealRow entry={entry} t={t} />
                </div>
              </div>
            );
          }

          const isWedding = entry.event.id === "wedding";
          return (
            <div key={`event-${entry.event.id}`} className="flex gap-3 pb-5">
              <TimeCol at={entry.at} locale={locale} timeZone={timeZone} />
              <ConnectorCol tone={isWedding ? "wedding" : "event"} />
              <div className="flex-1">
                {isWedding ? (
                  <WeddingCard
                    event={entry.event}
                    t={t}
                    locale={locale}
                    timeZone={timeZone}
                    mainEventLabel={mainEventLabel}
                  />
                ) : (
                  <EventCard
                    event={entry.event}
                    t={t}
                    locale={locale}
                    timeZone={timeZone}
                  />
                )}
              </div>
            </div>
          );
        })}
      </div>

      {signOff && (
        <div className="flex flex-col items-center gap-3 pb-8 pt-4 text-center">
          <SingleWave className="w-16 text-driftwood-faint opacity-60" />
          <p className="font-display text-[24px] leading-none text-driftwood-soft">
            {signOff}
          </p>
        </div>
      )}
    </div>
  );
}

export function ScheduleScreen({
  tier,
  config,
  live,
}: {
  tier: Tier;
  /** Live config — literal plus the couple's runtime overrides — from the server wrapper. */
  config: WeddingConfig;
  /**
   * Whether Event mode is live — forwarded to `BottomTabBar` so the
   * Chat/Photos tabs don't appear before there's anything there.
   */
  live: boolean;
}) {
  const t = useTranslations("schedule");
  const tWedding = useTranslations("wedding");
  const locale = useLocale();
  const timeZone = config.dates.timeZone;

  // Same pattern as RsvpFlow: the stored tier and the speakeasy flag can only
  // come from the guest's own Firestore document, never the link they arrived
  // on. Until that read resolves, the schedule shows exactly what the tier
  // link is entitled to and nothing more.
  const [storedTier, setStoredTier] = useState<Tier | null>(null);
  const [speakeasyInvited, setSpeakeasyInvited] = useState(false);
  const effectiveTier = storedTier ?? tier;

  useEffect(() => {
    const { auth, db } = getFirebase();
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const snap = await getDoc(doc(db, "rsvps", user.uid));
      if (!snap.exists()) return;
      const stored = snap.data();
      if (isTier(stored.tier)) setStoredTier(stored.tier);
      setSpeakeasyInvited(stored.speakeasyInvited === true);
    });
  }, []);

  const events = useMemo(
    () => eventsForGuest(effectiveTier, { speakeasyInvited, config }),
    [effectiveTier, speakeasyInvited, config]
  );
  const meals = useMemo(() => mealsForEvents(events, config), [events, config]);
  const timeline = useMemo(
    () => scheduleTimeline(events, meals),
    [events, meals]
  );

  const days = useMemo(() => {
    const map = new Map<string, TimelineEntry[]>();
    for (const entry of timeline) {
      const key = dayKey(entry.at, config);
      const list = map.get(key);
      if (list) list.push(entry);
      else map.set(key, [entry]);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [timeline, config]);

  const [activeDay, setActiveDay] = useState<string | undefined>(
    () => days[0]?.[0]
  );

  const sectionRefs = useRef(new Map<string, HTMLDivElement>());

  useEffect(() => {
    const observer = new IntersectionObserver(
      (observed) => {
        const visible = observed.find((entry) => entry.isIntersecting);
        const key = visible?.target.getAttribute("data-day");
        if (key) setActiveDay(key);
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    );
    for (const el of sectionRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [days]);

  const timeZoneLabel = useMemo(() => {
    const part = new Intl.DateTimeFormat(locale, {
      timeZone,
      timeZoneName: "short",
    })
      .formatToParts(new Date())
      .find((p) => p.type === "timeZoneName");
    return part?.value ?? "";
  }, [locale, timeZone]);

  return (
    <div className="relative mx-auto flex h-dvh w-full max-w-md flex-col overflow-hidden bg-sand">
      <header className="flex-none px-6 pb-4 pt-[max(28px,env(safe-area-inset-top))]">
        <h1 className="font-display text-[36px] leading-none text-deeptide">
          {t("title")}
        </h1>
        <p className="mt-1.5 font-sans text-[13px] text-driftwood-soft">
          {t("subtitle", {
            tz: timeZoneLabel,
            region: config.destination.shortLabel,
          })}
        </p>

        <div className="mt-5 flex gap-2">
          {days.map(([key, entries]) => {
            const date = new Date(entries[0].at);
            const weekday = new Intl.DateTimeFormat(locale, {
              weekday: "short",
              timeZone,
            }).format(date);
            const dayNum = new Intl.DateTimeFormat(locale, {
              day: "numeric",
              timeZone,
            }).format(date);
            const isActive = key === activeDay;
            return (
              <a
                key={key}
                href={`#day-${key}`}
                className={`flex-1 rounded-[12px] py-2 text-center font-sans transition-colors ${
                  isActive
                    ? "bg-deeptide text-foam"
                    : "bg-card text-driftwood-soft"
                }`}
              >
                <span className="block text-[10px] uppercase tracking-[0.08em] opacity-80">
                  {weekday}
                </span>
                <span className="block text-[15px] font-medium leading-tight">
                  {dayNum}
                </span>
              </a>
            );
          })}
        </div>
      </header>

      <div
        className="flex-1 scroll-smooth overflow-y-auto px-6 pt-1.5"
        style={{ paddingBottom: BOTTOM_TAB_BAR_HEIGHT + 24 }}
      >
        {days.map(([key, entries], dayIndex) => (
          <div key={key} id={`day-${key}`}>
            <DaySection
              entries={entries}
              locale={locale}
              timeZone={timeZone}
              t={tWedding}
              mainEventLabel={t("mainEvent")}
              signOff={dayIndex === days.length - 1 ? t("signOff") : null}
              registerRef={(el) => {
                if (el) {
                  el.setAttribute("data-day", key);
                  sectionRefs.current.set(key, el);
                } else {
                  sectionRefs.current.delete(key);
                }
              }}
            />
          </div>
        ))}
      </div>

      <BottomTabBar active="schedule" tier={effectiveTier} live={live} />
    </div>
  );
}
