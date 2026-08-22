import Link from "next/link";
import { getLocale, getTranslations } from "next-intl/server";
import {
  ACCENT_FILL,
  COUPLE,
  DESTINATION,
  LOGISTICS,
  WEDDING_DATES,
  eventDayNumber,
  eventsForTier,
  rsvpDeadlineLongLabel,
  rsvpHref,
  weddingDateRangeLabel,
  type Tier,
  type WeddingConfig,
  type WeddingEvent,
} from "@/content/wedding";
import { DEFAULT_LOCALE, LOCALE_TAGS, isLocale } from "@/i18n/locales";
import { eventCopy, logisticsCopy, override } from "@/i18n/weddingCopy";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Palm, Shell, SingleWave } from "@/components/motifs";
import { ScallopEdge } from "@/components/rsvp/ui";

/**
 * Screen 1b — the invite landing.
 *
 * Unlike the RSVP this is a document, not an app shell: it scrolls the whole
 * page rather than a pane inside a fixed frame. Everything below the hero
 * surfaces on scroll via the `scroll-*` utilities in globals.css.
 *
 * There is no `"use client"` here on purpose. Every animation on this screen —
 * the curtain, the staggered rises, the scroll reveals — is CSS, so the page
 * itself ships as static HTML. The one client island is `LanguageSwitcher` in
 * the hero, and it is deliberate: a guest who reads only Odia has to be able
 * to switch before reading anything, which no CSS-only control can do. Keep it
 * the only one — adding state to the page itself would undo the rest.
 *
 * It is tier-aware where the mockup isn't. The mockup always lists every day
 * because it has one imagined guest; a reception-only guest shown all five
 * would be reading an invitation to four events they aren't invited to.
 */
/**
 * `config` is passed in rather than imported so that the times rendered here
 * are the *live* ones — the literal with the couple's dashboard edits merged
 * over it. Importing `EVENTS` directly would pin this screen to whatever was
 * compiled in, and a schedule change would need a redeploy to show up.
 */
export async function InviteLanding({
  tier,
  config,
}: {
  tier: Tier;
  config: WeddingConfig;
}) {
  const events = eventsForTier(tier, config);
  const t = await getTranslations("landing");
  const tCommon = await getTranslations("common");
  const tag = await localeTag();

  return (
    <main className="relative w-full overflow-x-hidden bg-sand">
      <Curtain />
      <Hero />

      <section className="scroll-reveal mx-auto w-full max-w-content px-[34px] pt-[34px] pb-2.5 text-center">
        <p className="text-pretty font-serif text-2xl font-light leading-[1.35] text-driftwood">
          {t("lede", { days: dayCount(events) })}
        </p>
        <p className="mt-3.5 text-pretty font-sans text-[14.5px] leading-[1.75] text-driftwood-soft">
          {t("blurb", { count: events.length })}
        </p>
      </section>

      <div className="scroll-grow px-0 pt-[26px] pb-1.5">
        <DoubleWave />
      </div>

      <section className="mx-auto w-full max-w-content px-6 pt-1.5">
        <h2 className="mb-4 text-center font-sans text-[9.5px] font-medium uppercase tracking-[0.3em] text-driftwood-faint">
          {t("daysHeading", { days: events.length })}
        </h2>

        <ul className="flex flex-col gap-2.5">
          {events.map((event) => (
            <li key={event.id}>
              <DayCard event={event} />
            </li>
          ))}
        </ul>
      </section>

      <TravelAndStay />
      <PhotoBand />

      <section className="scroll-lift mx-auto w-full max-w-content px-[30px] pt-[34px] pb-[46px] text-center">
        <p className="font-serif text-[21px] font-light italic leading-[1.4] text-driftwood">
          {t("willYouBeWithUs")}
        </p>
        <p className="mt-2 font-sans text-[13px] leading-[1.6] text-driftwood-soft">
          {t("replyBy", { date: rsvpDeadlineLongLabel(tag) })}
        </p>

        <div className="mt-5 flex flex-col gap-2.5">
          {/* The tier rides along in the href. Without it the RSVP falls back
              to `full` and a narrow invite quietly widens itself. */}
          <Link
            href={rsvpHref(tier)}
            className="rounded-pill bg-coral p-4 font-sans text-[14.5px] font-medium leading-none tracking-[0.04em] text-foam shadow-[0_8px_22px_rgba(226,138,118,0.4)] transition-colors hover:bg-coral-deep"
          >
            {t("ctaRsvp")}
          </Link>
        </div>

        <SingleWave className="mx-auto mt-8 w-[70%] text-warmgold opacity-60" />
        <p className="mt-3.5 font-display text-[22px] leading-none text-driftwood-soft">
          {t("signOff")}
        </p>
        <p className="mt-6 font-sans text-[11px] tracking-wide text-driftwood-faint">
          {tCommon("madeBy")}
        </p>
        <Link
          href="/dashboard"
          className="mt-2 inline-block font-sans text-[11px] tracking-wide text-driftwood-faint underline underline-offset-4"
        >
          {t("dashboardLogin")}
        </Link>
      </section>
    </main>
  );
}

/**
 * The BCP-47 tag the `Intl` formatters in wedding.ts want, from the cookie
 * locale. Those helpers default to `en-IN`; without this the dates under a
 * Hindi hero would still read "Mon, 28 December 2026".
 */
async function localeTag(): Promise<string> {
  const locale = await getLocale();
  return LOCALE_TAGS[isLocale(locale) ? locale : DEFAULT_LOCALE];
}

/**
 * Distinct calendar days the guest is invited across, in the wedding's zone.
 *
 * Counted rather than hardcoded: the schedule has already moved once — five
 * events over four days became five over three — and prose that says "four
 * days" while the list below shows three is the kind of error nobody notices
 * until a guest does.
 */
function dayCount(events: WeddingEvent[]): number {
  const days = new Set(
    events.map((event) =>
      new Intl.DateTimeFormat("en-CA", {
        dateStyle: "short",
        timeZone: WEDDING_DATES.timeZone,
      }).format(new Date(event.startsAt))
    )
  );
  return days.size;
}

/**
 * The sand panel that holds the monogram, then lifts.
 *
 * Plays on every load, by request. An earlier version showed it once per
 * session and skipped it thereafter — that turned out to be the wrong trade
 * twice over. It made the invite feel different on the second open, and
 * because the hero's rise delays (3s+) are tuned to the curtain clearing, a
 * skipped curtain left three seconds of empty gradient where the names should
 * be. Keeping the two in lockstep is what makes the opening read as one move.
 *
 * `pointer-events-none` matters: the curtain sits over the whole page for
 * ~2 seconds, and a guest who taps in that window should reach the page under
 * it, not the panel.
 */
async function Curtain() {
  const t = await getTranslations("wedding");
  const shortLabel = t.has("destination.shortLabel")
    ? t("destination.shortLabel")
    : DESTINATION.shortLabel;

  return (
    <div
      aria-hidden
      className="animate-curtain pointer-events-none fixed inset-0 z-20 flex items-center justify-center overflow-hidden bg-sunbleach"
    >
      <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_40%,rgba(255,255,255,0.7),transparent_70%)]" />

      <div className="animate-mono-out text-center">
        <SingleWave className="mx-auto mb-3.5 w-[120px] text-warmgold" />
        <div className="font-display text-[40px] leading-[1.1] text-deeptide">
          {COUPLE.partnerA.charAt(0)}{" "}
          <span className="text-warmgold">&amp;</span>{" "}
          {COUPLE.partnerB.charAt(0)}
        </div>
        <div className="mt-3.5 font-sans text-[9px] font-medium uppercase tracking-[0.4em] text-[#8c6b3a]">
          {shortLabel}
        </div>
      </div>

      <ScallopEdge className="text-sunbleach" />
    </div>
  );
}

/**
 * The 600px opening panel: teal at the top falling to a peach horizon, two
 * palms leaning in from the edges, the names, and a scroll hint.
 *
 * The text delays start at 3s so the lines arrive as the curtain clears. The
 * two are a single choreographed move — change one delay and the other has to
 * follow, or the names rise onto a panel that hasn't lifted yet.
 */
async function Hero() {
  const t = await getTranslations("landing");
  const tCommon = await getTranslations("common");
  const tWedding = await getTranslations("wedding");
  const tag = await localeTag();
  const label = tWedding.has("destination.label")
    ? tWedding("destination.label")
    : DESTINATION.label;

  return (
    <div className="relative h-[600px] overflow-hidden bg-[linear-gradient(170deg,var(--color-deeptide)_0%,var(--color-shallows-bright)_40%,var(--color-shallows)_72%,var(--color-horizon)_100%)]">
      <div className="animate-glow absolute inset-0 bg-[radial-gradient(38%_26%_at_70%_70%,rgba(255,236,200,0.85),transparent_70%)]" />

      {/* Above the curtain (z-20) rather than under it: the switcher is the one
          control that must be reachable before the guest has read anything,
          and the curtain covers the page for the first ~2 seconds. */}
      <LanguageSwitcher
        tone="ocean"
        className="absolute right-3 top-3 z-30 justify-end"
      />

      <Palm className="animate-sway absolute -left-[26px] -top-3.5 w-[190px] opacity-50" />
      <Palm
        short
        className="animate-sway-b absolute -right-10 top-[26px] w-[210px] opacity-[0.34]"
      />

      <div className="absolute inset-x-0 top-[150px] px-[34px] text-center">
        <p
          className="animate-rise font-sans text-[9.5px] font-medium uppercase tracking-[0.42em] text-[rgba(251,246,238,0.8)]"
          style={{ animationDelay: "3s" }}
        >
          {t("saveTheDate")}
        </p>

        <p
          className="animate-rise mt-5 font-display text-[70px] leading-[0.9] text-[#fff9f0] [text-shadow:0_3px_26px_rgba(15,62,64,0.35)]"
          style={{ animationDelay: "3.15s" }}
        >
          {COUPLE.partnerA}
        </p>
        <p
          className="animate-rise my-2 font-serif text-xl font-light italic leading-none text-[#f6d9a8]"
          style={{ animationDelay: "3.5s" }}
        >
          {tCommon("and")}
        </p>
        <p
          className="animate-rise font-display text-[70px] leading-[0.9] text-[#fff9f0] [text-shadow:0_3px_26px_rgba(15,62,64,0.35)]"
          style={{ animationDelay: "3.4s" }}
        >
          {COUPLE.partnerB}
        </p>

        <div
          className="animate-rise mt-[26px] flex items-center justify-center gap-3"
          style={{ animationDelay: "3.9s" }}
        >
          <span className="h-px w-[34px] bg-[rgba(251,246,238,0.5)]" />
          <span className="font-sans text-[12.5px] uppercase leading-[1.6] tracking-[0.2em] text-[#fff9f0]">
            {weddingDateRangeLabel(tag)}
          </span>
          <span className="h-px w-[34px] bg-[rgba(251,246,238,0.5)]" />
        </div>

        <p
          className="animate-rise mt-2 font-serif text-[15px] font-light leading-[1.5] tracking-[0.06em] text-[rgba(255,249,240,0.9)]"
          style={{ animationDelay: "4.05s" }}
        >
          {label}
        </p>
      </div>

      <div
        className="animate-rise absolute inset-x-0 bottom-[38px] flex flex-col items-center gap-2"
        style={{ animationDelay: "4.4s" }}
      >
        <span className="font-sans text-[10px] uppercase tracking-[0.3em] text-[rgba(251,246,238,0.75)]">
          {t("scroll")}
        </span>
        <span className="h-[26px] w-px bg-[linear-gradient(rgba(251,246,238,0.8),transparent)]" />
      </div>

      <ScallopEdge className="text-sand" />
    </div>
  );
}

async function DayCard({ event }: { event: WeddingEvent }) {
  const t = await getTranslations("wedding");
  const copy = eventCopy(t, event);
  const tag = await localeTag();

  return (
    <div className="scroll-reveal flex items-center gap-3.5 rounded-card bg-card px-4 py-3.5">
      <span
        className={`grid size-[34px] flex-none place-items-center rounded-full font-sans text-xs font-medium text-foam ${
          ACCENT_FILL[event.accent]
        }`}
      >
        {eventDayNumber(event.startsAt, tag)}
      </span>
      <span className="flex-1">
        <span className="block font-display text-[26px] leading-none text-driftwood">
          {copy.name}
        </span>
        <span className="mt-1 block font-sans text-xs leading-[1.4] text-driftwood-soft">
          {copy.daypart} · {copy.venueShort} · {copy.dressCode}
        </span>
      </span>
    </div>
  );
}

/**
 * The mockup's second CTA read "Travel & stay details" and, being a mockup,
 * went nowhere — that screen exists in no version of the plan. This section
 * used to be the anchor target for that button; the button was dropped as
 * dead weight (a guest can already scroll to it), but the `id="travel"` stays
 * in case anything else ever wants to link here directly.
 *
 * Rail comes before air, which is the opposite of the mockup's ordering. That
 * is geography, not preference: Brahmapur is 16km away and Bhubaneswar is 170,
 * so for most guests the train genuinely is the shorter way in.
 *
 * NOTE: the shuttle and room block are PLACEHOLDERS from LOGISTICS — neither is
 * arranged yet. The airport and station themselves are real.
 */
async function TravelAndStay() {
  const t = await getTranslations("landing");
  const tWedding = await getTranslations("wedding");
  const shuttle = logisticsCopy(tWedding, "shuttle", LOGISTICS.shuttle);
  const stay = logisticsCopy(tWedding, "stay", LOGISTICS.stay);

  return (
    <section id="travel" className="scroll-reveal scroll-mt-6 mx-auto w-full max-w-content px-6 pt-9">
      <h2 className="mb-4 text-center font-sans text-[9.5px] font-medium uppercase tracking-[0.3em] text-driftwood-faint">
        {t("travelHeading")}
      </h2>

      <div className="flex flex-col gap-2.5">
        {/* Station and airport *names* stay Latin on purpose — a guest reads
            them off a ticket or a signboard, and transliterating "BAM" helps
            nobody. Only the distance notes around them translate. */}
        <LogisticsRow
          title={t("trainTo", { station: LOGISTICS.station.name })}
          description={override(
            tWedding,
            "logistics.station.note",
            LOGISTICS.station.note
          )}
        />
        <LogisticsRow
          title={t("flyInto", {
            code: LOGISTICS.airport.code,
            city: LOGISTICS.airport.name,
          })}
          description={override(
            tWedding,
            "logistics.airport.note",
            LOGISTICS.airport.note
          )}
        />
        <LogisticsRow title={shuttle.title} description={shuttle.description} />
        <LogisticsRow title={stay.title} description={stay.description} />
      </div>

      <p className="mt-3.5 text-center font-sans text-[11.5px] leading-[1.6] text-driftwood-faint">
        {t("travelNote")}
      </p>
    </section>
  );
}

function LogisticsRow({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-card bg-card px-4 py-3.5">
      <p className="font-sans text-[14.5px] font-medium leading-tight text-driftwood">
        {title}
      </p>
      <p className="mt-1 font-sans text-xs leading-[1.5] text-driftwood-soft">
        {description}
      </p>
    </div>
  );
}

/** The scalloped photo band. A placeholder until the couple supply an image. */
async function PhotoBand() {
  const t = await getTranslations("landing");

  return (
    <div className="scroll-lift relative mt-[30px] h-[230px] bg-[linear-gradient(140deg,var(--color-dune),var(--color-dune-deep))]">
      <div className="animate-tide absolute inset-0 bg-[radial-gradient(50%_60%_at_30%_40%,rgba(111,169,166,0.45),transparent_70%),radial-gradient(50%_50%_at_75%_60%,rgba(226,138,118,0.4),transparent_70%)] blur-[4px]" />

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5">
        <Shell className="w-11 text-bark opacity-55" />
        <span className="font-sans text-[11px] uppercase leading-none tracking-[0.24em] text-bark">
          {t("photoPlaceholder")}
        </span>
      </div>

      <ScallopEdge edge="top" className="text-sand" />
      <ScallopEdge className="text-sand" />
    </div>
  );
}

/* --- line art ------------------------------------------------------------ */

/** The teal-over-gold divider under the intro paragraph. */
function DoubleWave() {
  return (
    <svg
      viewBox="0 0 100 14"
      aria-hidden
      preserveAspectRatio="none"
      className="h-[26px] w-full"
      fill="none"
    >
      <path
        d="M2 8 Q14 1 26 8 T50 8 T74 8 T98 8"
        stroke="var(--color-shallows)"
        strokeWidth=".9"
        strokeLinecap="round"
      />
      <path
        d="M2 12 Q14 6 26 12 T50 12 T74 12 T98 12"
        stroke="var(--color-warmgold)"
        strokeWidth=".7"
        strokeLinecap="round"
        opacity=".7"
      />
    </svg>
  );
}
