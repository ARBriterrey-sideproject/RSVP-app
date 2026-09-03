"use client";

/**
 * "Today", before the wedding weekend opens.
 *
 * The bottom tab bar shows a Today tab all year, but until `isWeddingLive`
 * flips there was nothing behind it — the tab's href was `/`, so tapping it
 * bounced the guest back to the invite they'd just come from. `/today` now
 * branches: `TodayScreen` inside the window, this the rest of the time.
 *
 * Deliberately light. It answers the four questions a guest actually has
 * months out — how long now, did I reply, which days am I coming to, and how
 * do I get there — and nothing else. In particular there is **no weather
 * card**: Open-Meteo's free forecast horizon is about sixteen days and the
 * call this app makes is `current=`-only, so pre-wedding it could only report
 * today's Gopalpur conditions on a screen about December. Same rule as the
 * removed room-block card: don't show a fact the app can't actually source.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import {
  ACCENT_FILL,
  ACCENT_TINT,
  dayKey,
  eventsForTier,
  formatEventWhen,
  mapsUrl,
  rsvpDeadlineLabel,
  rsvpHref,
  tierCode,
  type Tier,
  type WeddingConfig,
  type WeddingEvent,
} from "@/content/wedding";
import { eventCopy, override, type Lookup } from "@/i18n/weddingCopy";
import { BOTTOM_TAB_BAR_HEIGHT } from "@/components/nav/BottomTabBar";
import { AppShell } from "@/components/layout/AppShell";
import { Palm } from "@/components/motifs";
import { ScallopEdge } from "@/components/rsvp/ui";
import { useGuestRsvp } from "@/components/today/useGuestRsvp";

function EventRow({
  event,
  locale,
  t,
}: {
  event: WeddingEvent;
  locale: string;
  t: Lookup;
}) {
  const copy = eventCopy(t, event);
  return (
    <div
      // The e2e spec counts these: "did the declined event drop out" has no
      // other stable handle, since the name is plain copy inside the card.
      data-testid="upcoming-event"
      className="relative overflow-hidden rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4"
    >
      <div
        className={`absolute -right-4 -top-4 size-20 rounded-full opacity-[0.12] ${ACCENT_FILL[event.accent]}`}
      />
      <div className="relative">
        <p className="font-display text-[25px] leading-none text-driftwood">
          {copy.name}
        </p>
        <p className="mt-1.5 font-sans text-[12.5px] text-driftwood-soft">
          {formatEventWhen(event.startsAt, locale)}
        </p>
        <p className="mt-0.5 font-sans text-[12.5px] text-driftwood-soft">
          {copy.venueShort}
        </p>
        <span
          className={`mt-2.5 inline-block rounded-pill px-2.5 py-1 font-sans text-[10.5px] font-medium text-driftwood ${ACCENT_TINT[event.accent]}`}
        >
          {copy.dressCode}
        </span>
      </div>
    </div>
  );
}

export function UpcomingScreen({
  tier,
  config,
  initialNow,
}: {
  tier: Tier;
  config: WeddingConfig;
  /** Dev-only `?asOf=` anchor, same as TodayScreen's — lets the countdown be checked at a date. */
  initialNow?: Date;
}) {
  const t = useTranslations("upcoming");
  const tToday = useTranslations("today");
  const tWedding = useTranslations("wedding");
  const locale = useLocale();

  // Day granularity only — no ticking interval, unlike TodayScreen. A snapshot
  // at mount is enough for a number that changes once a night.
  const [now] = useState(() => initialNow ?? new Date());

  const { storedTier, guestName, partySize, perEventAttendance, loaded } =
    useGuestRsvp();
  const effectiveTier = storedTier ?? tier;

  const eligible = useMemo(
    () => eventsForTier(effectiveTier, config),
    [effectiveTier, config]
  );
  // Same rule as TodayScreen: a guest who hasn't replied sees everything
  // they're eligible for; one who has sees only what they said yes to.
  const attending = useMemo(
    () =>
      perEventAttendance
        ? eligible.filter((event) => perEventAttendance[event.id] === true)
        : eligible,
    [eligible, perEventAttendance]
  );

  const hasReplied = perEventAttendance !== null;
  const firstEvent = attending[0] ?? eligible[0];

  // Calendar days between today and the first day they're coming, both taken
  // in the wedding's own zone so the answer doesn't shift with the reader's.
  const today = dayKey(now.toISOString(), config);
  const daysToGo = firstEvent
    ? Math.round(
        (Date.parse(dayKey(firstEvent.startsAt, config)) - Date.parse(today)) /
          86_400_000
      )
    : 0;

  return (
    <AppShell tab="today" tier={effectiveTier} live={false}>
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: BOTTOM_TAB_BAR_HEIGHT + 24 }}
      >
        {/* Full-bleed the same way TodayScreen's hero is, including the centred
            `max-w-content` inner box — see the comment there for why the
            content can't be laid out against the full-width header. */}
        <header className="relative left-1/2 w-screen -translate-x-1/2 overflow-hidden bg-[linear-gradient(165deg,var(--color-deeptide)_0%,var(--color-shallows-bright)_55%,var(--color-shallows)_100%)] pb-[34px] pt-[max(60px,env(safe-area-inset-top))]">
          <div className="animate-tide pointer-events-none absolute inset-0 bg-[radial-gradient(50%_45%_at_25%_25%,rgba(226,138,118,0.45),transparent_70%),radial-gradient(45%_45%_at_85%_60%,rgba(255,236,200,0.55),transparent_70%)]" />
          <div className="relative mx-auto w-full max-w-content px-6">
            <Palm
              className="animate-sway-b pointer-events-none absolute -right-2 -top-16 w-[170px] opacity-[0.28]"
              short
            />
            <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.34em] text-foam/75">
              {guestName ? t("eyebrowWithName", { name: guestName }) : t("eyebrow")}
            </p>
            <p className="mt-2.5 font-display text-[44px] leading-[1.05] text-foam">
              {daysToGo > 0 ? t("countdown", { days: daysToGo }) : t("countdownNow")}
            </p>
            <p className="mt-2.5 max-w-[270px] font-sans text-[13.5px] leading-[1.6] text-foam/90 md:max-w-[420px]">
              {/* The town is itself translatable — same lookup StepDone uses. */}
              {t("intro", {
                region: override(
                  tWedding,
                  "destination.region",
                  config.destination.region
                ),
              })}
            </p>
          </div>
          <ScallopEdge className="text-sand" />
        </header>

        {/* Your reply. Held back until the lookup settles rather than flashing
            "you haven't replied" at a guest who has. */}
        {loaded && (
          <section className="px-6 pt-4.5">
            <div className="rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5">
              <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
                {t("reply.title")}
              </p>
              <p className="mt-2 font-sans text-[13px] leading-[1.55] text-driftwood-soft">
                {hasReplied
                  ? t("reply.done", {
                      party: partySize ?? 1,
                      going: attending.length,
                      total: eligible.length,
                    })
                  : t("reply.pending", { deadline: rsvpDeadlineLabel(locale) })}
              </p>
              <Link
                href={rsvpHref(effectiveTier)}
                className={
                  hasReplied
                    ? "mt-3 inline-block font-sans text-[11.5px] font-medium text-coral-ink"
                    : "mt-3.5 block rounded-pill bg-deeptide px-3 py-3 text-center font-sans text-[13px] font-medium text-foam"
                }
              >
                {hasReplied ? t("reply.changeCta") : t("reply.cta")}
              </Link>
            </div>
          </section>
        )}

        {attending.length > 0 && (
          <section className="px-6 pt-5.5">
            <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
              {hasReplied ? t("attending.title") : t("attending.eligibleTitle")}
            </p>
            <div className="mt-2.5 flex flex-col gap-2.5">
              {attending.map((event) => (
                <EventRow
                  key={event.id}
                  event={event}
                  locale={locale}
                  t={tWedding}
                />
              ))}
            </div>
            <Link
              href={`/schedule?tier=${tierCode(effectiveTier)}`}
              className="mt-3 inline-block font-sans text-[11.5px] font-medium text-coral-ink"
            >
              {tToday("viewSchedule")}
            </Link>
          </section>
        )}

        {firstEvent && (
          <section className="px-6 pt-5.5">
            <div className="rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5">
              <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
                {t("gettingThere.title")}
              </p>
              <p className="mt-2 font-sans text-[13px] leading-[1.55] text-driftwood-soft">
                {eventCopy(tWedding, firstEvent).venue}
              </p>
              <a
                href={mapsUrl(firstEvent)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block font-sans text-[11.5px] font-medium text-coral-ink"
              >
                {tToday("getDirections")}
              </a>
            </div>
          </section>
        )}

        {/* Memories is the one live-wedding feature open before the weekend —
            a note to the couple doesn't need the wedding to have started. */}
        <section className="px-6 pt-5.5">
          <Link
            href={`/memories?tier=${tierCode(effectiveTier)}`}
            className="flex items-center justify-between gap-3 rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5"
          >
            <div>
              <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
                {tToday("memories.title")}
              </p>
              <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-driftwood-soft">
                {tToday("memories.body")}
              </p>
            </div>
            <span className="flex-none font-sans text-[11.5px] font-medium text-coral-ink">
              {tToday("memories.cta")}
            </span>
          </Link>
        </section>

        {/* The way back to the invitation. `/` now redirects a guest who has
            replied straight here, so without this link the invitation itself —
            the hero, the days, travel and stay — would be unreachable for
            exactly the guests who were most pleased to receive it. `invite=1`
            is the flag that suppresses that redirect for one visit. */}
        <div className="flex flex-col items-center gap-2 px-6 pb-6 pt-7 text-center">
          <Link
            href={`/?tier=${tierCode(effectiveTier)}&invite=1`}
            className="font-sans text-[11.5px] font-medium text-coral-ink"
          >
            {t("viewInvitation")}
          </Link>
          <p className="mt-1 font-display text-[19px] leading-none text-driftwood-faint">
            {t("signOff")}
          </p>
        </div>
      </div>
    </AppShell>
  );
}
