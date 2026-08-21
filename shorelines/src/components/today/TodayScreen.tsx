"use client";

/**
 * Screen 1e, "Today" — identity file lines 604-703.
 *
 * The other half of "one app, one link, two phases": `page.tsx` swaps this in
 * for `InviteLanding` once `isWeddingLive(config)` is true, on the same tier
 * link the guest has always had. Client, not server, for the same reason as
 * `ScheduleScreen` — the stored tier, the guest's name and which events they
 * actually said yes to can only come from their own Firestore document, never
 * the URL they arrived on.
 *
 * Two deliberate departures from the mockup, both explained where they
 * happen below: "High tide" becomes "Feels like" (Open-Meteo has no tide
 * data, and this app doesn't invent facts it can't source — see the
 * room-block card precedent in CLAUDE.md), and the bare countdown numeral
 * becomes a translated, unit-labelled duration.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { getFirebase } from "@/lib/firebase/client";
import {
  pollFromDoc,
  pollsQuery,
  pollVoteFromDoc,
  pollVotesQuery,
  type Poll,
  type PollVote,
} from "@/lib/firebase/polls";
import { submitSongRequest } from "@/lib/firebase/songRequests";
import {
  ACCENT_FILL,
  ACCENT_TINT,
  dayKey,
  eventsForTier,
  isTier,
  mapsUrl,
  mealsForEvents,
  scheduleTimeline,
  tierCode,
  type Tier,
  type TimelineEntry,
  type WeddingConfig,
  type WeddingEvent,
} from "@/content/wedding";
import { eventCopy, scheduleCopy, type Lookup } from "@/i18n/weddingCopy";
import { BOTTOM_TAB_BAR_HEIGHT } from "@/components/nav/BottomTabBar";
import { AppShell } from "@/components/layout/AppShell";
import { Palm } from "@/components/motifs";
import { ScallopEdge } from "@/components/rsvp/ui";

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

/** N/NE/E/.../NW from a wind bearing — a real derivation, not an invented fact. */
function compassPoint(deg: number): string {
  const points = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
  return points[Math.round(deg / 45) % 8];
}

/** Formats a bare "HH:MM" (Open-Meteo's local-time strings) without touching the browser's own zone. */
function formatClock(hhmm: string, locale: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Intl.DateTimeFormat(locale, {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(2000, 0, 1, h, m));
}

type Weather = {
  tempC: number;
  apparentC: number;
  windKmh: number;
  windCompass: string;
  sunsetLabel: string;
  condition: "clear" | "cloudy" | "rain" | "storm" | "other";
} | null;

function conditionBucket(code: number): "clear" | "cloudy" | "rain" | "storm" | "other" {
  if (code === 0) return "clear";
  if (code <= 3 || code === 45 || code === 48) return "cloudy";
  if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 95) return "storm";
  return "other";
}

function LaterRow({
  entry,
  t,
  locale,
  timeZone,
}: {
  entry: TimelineEntry;
  t: Lookup;
  locale: string;
  timeZone: string;
}) {
  const isMeal = entry.kind === "meal";
  const name = isMeal
    ? scheduleCopy(t, entry.item).name
    : eventCopy(t, entry.event).name;
  const sub = isMeal
    ? scheduleCopy(t, entry.item).note
    : `${eventCopy(t, entry.event).daypart} · ${eventCopy(t, entry.event).venueShort}`;
  const dotClass = isMeal ? "bg-hairline" : ACCENT_FILL[entry.event.accent];

  return (
    <div className="flex items-center gap-3 border-b border-driftwood/[0.07] py-3 last:border-b-0">
      <div className="w-[46px] flex-none font-sans text-[13px] text-driftwood">
        {timeParts(entry.at, locale, timeZone).main}
      </div>
      <span className={`size-[7px] flex-none rounded-full ${dotClass}`} />
      <div className="flex-1">
        <p className="font-sans text-[14px] leading-[1.3] text-driftwood">
          {name}
        </p>
        {sub && (
          <p className="mt-0.5 font-sans text-[12px] leading-[1.4] text-driftwood-soft">
            {sub}
          </p>
        )}
      </div>
    </div>
  );
}

/** A poll's live results, tallied client-side from its own vote listener. */
function PollMiniRow({ poll }: { poll: Poll }) {
  const [votes, setVotes] = useState<PollVote[]>([]);
  useEffect(() => {
    const { db } = getFirebase();
    return onSnapshot(pollVotesQuery(db, poll.id), (snap) => {
      setVotes(snap.docs.map((d) => pollVoteFromDoc(d)));
    });
  }, [poll.id]);

  const total = votes.length;
  const barColors = ["bg-deeptide", "bg-coral", "bg-driftwood/40", "bg-shallows"];

  return (
    <div>
      <p className="font-sans text-[13px] leading-[1.35] text-driftwood">
        {poll.question}
      </p>
      <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-driftwood/10">
        {total > 0
          ? poll.options.map((option, i) => {
              const count = votes.filter((v) => v.optionId === option.id).length;
              const pct = (count / total) * 100;
              if (pct === 0) return null;
              return (
                <div
                  key={option.id}
                  className={barColors[i % barColors.length]}
                  style={{ width: `${pct}%` }}
                />
              );
            })
          : null}
      </div>
    </div>
  );
}

const SONG_REQUEST_CUTOFF_MS = 60 * 60 * 1000;

/**
 * Inline expand-to-form, not a route — the plan calls for "a small request
 * form", and there's only ever one relevant event (`nextEvent`) to attach it
 * to. The 1-hour cutoff and attendance check are re-verified server-side in
 * `submitSongRequest`; what's computed here only decides whether to show the
 * banner at all.
 */
function SongRequestBanner({
  event,
  eventLabel,
  overrideActive,
  t,
}: {
  event: WeddingEvent;
  eventLabel: string;
  overrideActive: boolean;
  t: Lookup;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function handleSubmit() {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await submitSongRequest(
        event.id,
        title.trim(),
        artist.trim() || undefined,
        note.trim() || undefined
      );
      setTitle("");
      setArtist("");
      setNote("");
      setSent(true);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t("songRequests.sendFailed")
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5">
      <button
        type="button"
        onClick={() => {
          setOpen((v) => !v);
          setSent(false);
          setError(null);
        }}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <div>
          <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
            {t("songRequests.title")}
          </p>
          <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-driftwood-soft">
            {t("songRequests.body", { event: eventLabel })}
          </p>
          {overrideActive ? (
            <p className="mt-1 font-sans text-[11.5px] text-coral-ink">
              {t("songRequests.overrideNote")}
            </p>
          ) : null}
        </div>
        <span className="flex-none font-sans text-[11.5px] font-medium text-coral-ink">
          {t("songRequests.cta")}
        </span>
      </button>

      {open ? (
        <div className="mt-3.5 flex flex-col gap-2.5 border-t border-driftwood/[0.08] pt-3.5">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("songRequests.titleLabel")}
            className="rounded-card bg-card px-3.5 py-2.5 font-sans text-[14px] text-driftwood outline-none placeholder:text-driftwood-faint"
          />
          <input
            value={artist}
            onChange={(e) => setArtist(e.target.value)}
            placeholder={t("songRequests.artistLabel")}
            className="rounded-card bg-card px-3.5 py-2.5 font-sans text-[14px] text-driftwood outline-none placeholder:text-driftwood-faint"
          />
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t("songRequests.noteLabel")}
            className="rounded-card bg-card px-3.5 py-2.5 font-sans text-[14px] text-driftwood outline-none placeholder:text-driftwood-faint"
          />
          {error ? (
            <p className="font-sans text-[12.5px] text-coral-ink">{error}</p>
          ) : null}
          {sent && !error ? (
            <p className="font-sans text-[12.5px] text-palm">
              {t("songRequests.sent")}
            </p>
          ) : null}
          <button
            type="button"
            disabled={!title.trim() || busy}
            onClick={() => void handleSubmit()}
            className="self-start rounded-pill bg-coral px-5 py-2.5 font-sans text-[13.5px] font-medium text-foam disabled:opacity-40"
          >
            {busy ? t("songRequests.submitting") : t("songRequests.submit")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function TodayScreen({
  tier,
  config,
  initialNow,
  songRequestsOverride,
}: {
  tier: Tier;
  /** Live config — literal plus the couple's runtime overrides — from the server wrapper. */
  config: WeddingConfig;
  /**
   * Dev-only anchor for "now", passed down from a `?asOf=` search param so this
   * screen can be reached and tested before the real wedding window opens.
   * Time still ticks forward in real time from this point — it isn't frozen.
   */
  initialNow?: Date;
  /** Lifts the 1-hour song-request cutoff entirely — read from `config/live` in `page.tsx`. */
  songRequestsOverride?: boolean;
}) {
  const t = useTranslations("today");
  const tWedding = useTranslations("wedding");
  const locale = useLocale();
  const timeZone = config.dates.timeZone;

  const [nowOffsetMs] = useState(() =>
    initialNow ? initialNow.getTime() - Date.now() : 0
  );
  const [now, setNow] = useState(() => new Date(Date.now() + nowOffsetMs));
  useEffect(() => {
    const id = setInterval(
      () => setNow(new Date(Date.now() + nowOffsetMs)),
      30_000
    );
    return () => clearInterval(id);
  }, [nowOffsetMs]);

  // Same pattern as ScheduleScreen and RsvpFlow: the stored tier, guest name
  // and per-event replies can only come from the guest's own Firestore
  // document, never the link they arrived on.
  const [storedTier, setStoredTier] = useState<Tier | null>(null);
  const [guestName, setGuestName] = useState<string | null>(null);
  const [perEventAttendance, setPerEventAttendance] = useState<Record<
    string,
    boolean
  > | null>(null);
  const effectiveTier = storedTier ?? tier;

  useEffect(() => {
    const { auth, db } = getFirebase();
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      const snap = await getDoc(doc(db, "rsvps", user.uid));
      if (!snap.exists()) return;
      const stored = snap.data();
      if (isTier(stored.tier)) setStoredTier(stored.tier);
      const party = stored.party;
      const firstName =
        Array.isArray(party) && typeof party[0]?.name === "string"
          ? party[0].name.trim()
          : "";
      setGuestName(firstName || null);
      if (
        stored.perEventAttendance &&
        typeof stored.perEventAttendance === "object"
      ) {
        setPerEventAttendance(
          stored.perEventAttendance as Record<string, boolean>
        );
      }
    });
  }, []);

  const eligible = useMemo(
    () => eventsForTier(effectiveTier, config),
    [effectiveTier, config]
  );
  // A guest who hasn't replied yet (no RSVP doc) sees everything they're
  // eligible for; one who has sees only what they actually said yes to.
  const attending = useMemo(
    () =>
      perEventAttendance
        ? eligible.filter((event) => perEventAttendance[event.id] === true)
        : eligible,
    [eligible, perEventAttendance]
  );

  const today = dayKey(now.toISOString(), config);
  const todayEvents = useMemo(
    () => attending.filter((event) => dayKey(event.startsAt, config) === today),
    [attending, config, today]
  );
  const todayMeals = useMemo(() => {
    const meals = mealsForEvents(attending, config);
    return meals.filter((item) => dayKey(item.startsAt, config) === today);
  }, [attending, config, today]);
  const todayTimeline = useMemo(
    () => scheduleTimeline(todayEvents, todayMeals),
    [todayEvents, todayMeals]
  );

  const nextEvent = todayEvents.find(
    (event) => Date.parse(event.startsAt) > now.getTime()
  );
  const laterEntries = todayTimeline.filter((entry) => {
    if (Date.parse(entry.at) <= now.getTime()) return false;
    if (nextEvent && entry.kind === "event" && entry.event.id === nextEvent.id)
      return false;
    return true;
  });

  const hourInTz = Number(
    new Intl.DateTimeFormat("en-GB", {
      hour: "2-digit",
      hourCycle: "h23",
      timeZone,
    }).format(now)
  );
  const period =
    hourInTz < 12 ? "morning" : hourInTz < 17 ? "afternoon" : "evening";

  const eyebrowDate = new Intl.DateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone,
  }).format(now);

  const firstToday = todayEvents[0];
  const lastToday = todayEvents[todayEvents.length - 1];
  const firstTime = firstToday
    ? (() => {
        const p = timeParts(firstToday.startsAt, locale, timeZone);
        return `${p.main} ${p.meridiem}`.trim();
      })()
    : "";
  const summary = t("summary", {
    count: todayEvents.length,
    first: firstToday ? eventCopy(tWedding, firstToday).name : "",
    firstTime,
    last:
      todayEvents.length > 1 && lastToday
        ? eventCopy(tWedding, lastToday).name
        : "",
  });

  const countdown = useMemo(() => {
    if (!nextEvent) return null;
    const ms = Math.max(0, Date.parse(nextEvent.startsAt) - now.getTime());
    const totalMinutes = Math.round(ms / 60000);
    const days = Math.floor(totalMinutes / 1440);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes;
    if (days >= 1) return t("countdown.days", { d: days });
    if (hours >= 1) return t("countdown.hours", { h: hours });
    return t("countdown.minutes", { m: minutes });
  }, [nextEvent, now, t]);

  const dressCodes = useMemo(() => {
    const seen = new Set<string>();
    const list: { label: string; accent: WeddingEvent["accent"] }[] = [];
    for (const event of todayEvents) {
      const label = eventCopy(tWedding, event).dressCode;
      if (seen.has(label)) continue;
      seen.add(label);
      list.push({ label, accent: event.accent });
    }
    return list;
  }, [todayEvents, tWedding]);

  const [weather, setWeather] = useState<Weather>(null);
  useEffect(() => {
    const controller = new AbortController();
    const { lat, lng } = config.destination.coordinates;
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,apparent_temperature,weather_code,wind_speed_10m,wind_direction_10m&daily=sunset&timezone=${encodeURIComponent(timeZone)}`;
    fetch(url, { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!data?.current) return;
        const sunsetIso: string | undefined = data.daily?.sunset?.[0];
        setWeather({
          tempC: Math.round(data.current.temperature_2m),
          apparentC: Math.round(data.current.apparent_temperature),
          windKmh: Math.round(data.current.wind_speed_10m),
          windCompass: compassPoint(data.current.wind_direction_10m),
          sunsetLabel: sunsetIso
            ? formatClock(sunsetIso.split("T")[1], locale)
            : "",
          condition: conditionBucket(data.current.weather_code),
        });
      })
      .catch(() => {
        // No forecast is better than a fabricated one — the card just stays hidden.
      });
    return () => controller.abort();
  }, [config.destination.coordinates, timeZone, locale]);

  const songRequestsOpen = useMemo(() => {
    if (!nextEvent) return false;
    if (songRequestsOverride) return true;
    return now.getTime() < Date.parse(nextEvent.startsAt) - SONG_REQUEST_CUTOFF_MS;
  }, [nextEvent, now, songRequestsOverride]);
  const songRequestsOverrideActive = Boolean(
    songRequestsOverride &&
      nextEvent &&
      now.getTime() >= Date.parse(nextEvent.startsAt) - SONG_REQUEST_CUTOFF_MS
  );

  const [openPolls, setOpenPolls] = useState<Poll[]>([]);
  useEffect(() => {
    const { db } = getFirebase();
    return onSnapshot(pollsQuery(db), (snap) => {
      setOpenPolls(
        snap.docs.map((d) => pollFromDoc(d)).filter((poll) => poll.status === "open")
      );
    });
  }, []);

  const weddingEvent = config.events.find((e) => e.id === "wedding");
  const daysToWedding = weddingEvent
    ? Math.round(
        (Date.parse(dayKey(weddingEvent.startsAt, config)) -
          Date.parse(today)) /
          86_400_000
      )
    : 0;

  return (
    <AppShell tab="today" tier={effectiveTier}>
      <div
        className="flex-1 overflow-y-auto"
        style={{ paddingBottom: BOTTOM_TAB_BAR_HEIGHT + 24 }}
      >
        <header className="relative overflow-hidden bg-[linear-gradient(165deg,var(--color-deeptide)_0%,var(--color-shallows-bright)_55%,var(--color-shallows)_100%)] px-6 pb-[34px] pt-[max(60px,env(safe-area-inset-top))]">
          <div className="animate-tide pointer-events-none absolute inset-0 bg-[radial-gradient(50%_45%_at_25%_25%,rgba(226,138,118,0.45),transparent_70%),radial-gradient(45%_45%_at_85%_60%,rgba(255,236,200,0.55),transparent_70%)]" />
          <Palm
            className="animate-sway-b pointer-events-none absolute -right-8 -top-5 w-[170px] opacity-[0.28]"
            short
          />
          <div className="relative">
            <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.34em] text-foam/75">
              {eyebrowDate}
            </p>
            <p className="mt-2.5 font-display text-[44px] leading-[1.05] text-foam">
              {guestName
                ? t("greetingWithName", { greeting: t(`greeting.${period}`), name: guestName })
                : t(`greeting.${period}`)}
            </p>
            <p className="mt-2.5 max-w-[270px] font-sans text-[13.5px] leading-[1.6] text-foam/90 md:max-w-[420px]">
              {summary}
            </p>
          </div>
          <ScallopEdge className="text-sand" />
        </header>

        {nextEvent && (
          <section className="px-6 pt-4.5">
            <div className="relative overflow-hidden rounded-card bg-[linear-gradient(150deg,var(--color-sunbleach)_0%,var(--color-card)_70%)] px-5 py-5">
              <div className="absolute -right-6 -top-6 size-28 rounded-full bg-coral/[0.18]" />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-coral-ink">
                    {t("upNext")}
                  </p>
                  <p className="mt-2 font-display text-[32px] leading-none text-driftwood">
                    {eventCopy(tWedding, nextEvent).name}
                  </p>
                  <p className="mt-1.5 font-sans text-[13px] text-driftwood-soft">
                    {timeParts(nextEvent.startsAt, locale, timeZone).main}{" "}
                    {timeParts(nextEvent.startsAt, locale, timeZone).meridiem}
                    {" · "}
                    {eventCopy(tWedding, nextEvent).venueShort}
                  </p>
                </div>
                <div className="flex-none text-right">
                  <p className="font-serif text-[30px] leading-none text-deeptide">
                    {countdown}
                  </p>
                  <p className="mt-1.5 font-sans text-[10px] uppercase tracking-[0.16em] text-driftwood-faint">
                    {t("fromNow")}
                  </p>
                </div>
              </div>
              <div className="relative mt-3.5 flex gap-2">
                <a
                  href={mapsUrl(nextEvent)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex-1 rounded-pill bg-deeptide px-3 py-3 text-center font-sans text-[12.5px] font-medium text-foam"
                >
                  {t("getDirections")}
                </a>
                <Link
                  href={`/schedule?tier=${tierCode(effectiveTier)}`}
                  className="flex-1 rounded-pill border border-deeptide/40 px-3 py-2.5 text-center font-sans text-[12.5px] font-medium text-deeptide"
                >
                  {t("shuttleTimes")}
                </Link>
              </div>
            </div>
          </section>
        )}

        {weather && (
          <section className="px-6 pt-3.5">
            <div className="flex items-center gap-4 rounded-card bg-card px-5 py-4.5">
              <div className="flex-none text-center">
                <p className="font-serif text-[34px] leading-none text-driftwood">
                  {weather.tempC}°
                </p>
                <p className="mt-1.5 font-sans text-[10px] uppercase tracking-[0.14em] text-driftwood-faint">
                  {t(`weather.condition.${weather.condition}`)}
                </p>
              </div>
              <div className="h-13 w-px flex-none bg-driftwood/10" />
              <div className="flex flex-1 flex-col gap-1.5 font-sans text-[12.5px] text-driftwood-soft">
                <div className="flex justify-between">
                  <span>{t("weather.feelsLike")}</span>
                  <span className="text-driftwood">{weather.apparentC}°</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("weather.sunset")}</span>
                  <span className="text-driftwood">{weather.sunsetLabel}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t("weather.seaBreeze")}</span>
                  <span className="text-driftwood">
                    {weather.windKmh} km/h {weather.windCompass}
                  </span>
                </div>
              </div>
            </div>
          </section>
        )}

        {dressCodes.length > 0 && (
          <section className="px-6 pt-3.5">
            <div className="rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5">
              <div className="flex items-baseline justify-between">
                <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
                  {t("dressCode.title")}
                </p>
                <Link
                  href={`/schedule?tier=${tierCode(effectiveTier)}`}
                  className="font-sans text-[11.5px] text-coral-ink"
                >
                  {t("dressCode.fullGuide")}
                </Link>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {dressCodes.map((d) => (
                  <span
                    key={d.label}
                    className={`rounded-pill px-2.5 py-1 font-sans text-[11px] font-medium text-driftwood ${ACCENT_TINT[d.accent]}`}
                  >
                    {d.label}
                  </span>
                ))}
              </div>
              <p className="mt-3 font-sans text-[12px] leading-[1.6] text-driftwood-soft">
                {t("dressCode.footnote")}
              </p>
            </div>
          </section>
        )}

        {nextEvent && songRequestsOpen && (
          <section className="px-6 pt-3.5">
            <SongRequestBanner
              event={nextEvent}
              eventLabel={eventCopy(tWedding, nextEvent).name}
              overrideActive={songRequestsOverrideActive}
              t={t}
            />
          </section>
        )}

        {laterEntries.length > 0 && (
          <section className="px-6 pt-5.5">
            <p className="mb-2.5 font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
              {t("laterToday")}
            </p>
            <div className="flex flex-col">
              {laterEntries.map((entry) => (
                <LaterRow
                  key={entry.kind === "meal" ? `meal-${entry.item.id}` : `event-${entry.event.id}`}
                  entry={entry}
                  t={tWedding}
                  locale={locale}
                  timeZone={timeZone}
                />
              ))}
            </div>
          </section>
        )}

        {openPolls.length > 0 && (
          <section className="px-6 pt-5.5">
            <Link
              href={`/polls?tier=${tierCode(effectiveTier)}`}
              className="block rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5"
            >
              <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
                {t("polls.title")}
              </p>
              <div className="mt-2.5 flex flex-col gap-3">
                {openPolls.slice(0, 2).map((poll) => (
                  <PollMiniRow key={poll.id} poll={poll} />
                ))}
              </div>
              <p className="mt-3 font-sans text-[11.5px] font-medium text-coral-ink">
                {t("polls.cta")}
              </p>
            </Link>
          </section>
        )}

        <section className="px-6 pt-5.5">
          <Link
            href={`/memories?tier=${tierCode(effectiveTier)}`}
            className="flex items-center justify-between gap-3 rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5"
          >
            <div>
              <p className="font-sans text-[9.5px] font-semibold uppercase tracking-[0.28em] text-driftwood-faint">
                {t("memories.title")}
              </p>
              <p className="mt-1.5 font-sans text-[13px] leading-[1.5] text-driftwood-soft">
                {t("memories.body")}
              </p>
            </div>
            <span className="flex-none font-sans text-[11.5px] font-medium text-coral-ink">
              {t("memories.cta")}
            </span>
          </Link>
        </section>

        <div className="flex flex-col items-center gap-2 px-6 pb-6 pt-7 text-center">
          <p className="font-display text-[19px] leading-none text-driftwood-faint">
            {daysToWedding > 0
              ? t("signOff.before", { days: daysToWedding })
              : t("signOff.after")}
          </p>
        </div>
      </div>
    </AppShell>
  );
}
