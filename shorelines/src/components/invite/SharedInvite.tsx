"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { doc, getDoc } from "firebase/firestore";
import {
  ACCENT_FILL,
  COUPLE,
  DESTINATION,
  LOGISTICS,
  eventDayNumber,
  eventsForTier,
  formatEventWhen,
  isTier,
  mapsUrl,
  mealsForEvents,
  weddingDateRangeLabel,
  type ScheduleItem,
  type Tier,
  type WeddingConfig,
  type WeddingEvent,
} from "@/content/wedding";
import { getFirebase } from "@/lib/firebase/client";
import { eventCopy, override, scheduleCopy } from "@/i18n/weddingCopy";
import { useLocaleTag } from "@/i18n/useLocaleTag";
import { ScallopEdge } from "@/components/rsvp/ui";

/**
 * The read-only invitation behind a family QR.
 *
 * Deliberately has no RSVP anywhere on it. That is the whole design: the
 * duplicate-reply problem isn't solved by warning people off a second form,
 * it's solved by handing them a page that has no form to fill. Everything a
 * guest travelling with the family actually needs — the days, the times, the
 * dress codes, where to go — is here; the reply itself is shown as settled
 * fact, in someone else's name.
 *
 * Read client-side rather than on the server because there is no Admin SDK in
 * the Next app; the open `get` rule on `invites/{code}` is what makes it work,
 * and the code being unguessable is what makes that safe.
 */
export function SharedInvite({
  shareCode,
  config,
}: {
  shareCode: string;
  /**
   * Live config from the server page. The invite document itself is still read
   * client-side — only the reply is per-guest and it needs the browser's open
   * `get` on `invites/{code}` — but the *times* around it are the couple's
   * current ones, merged before this component ever renders.
   */
  config: WeddingConfig;
}) {
  const t = useTranslations("shared");
  const tWedding = useTranslations("wedding");
  const tCommon = useTranslations("common");
  const tag = useLocaleTag();
  const invite = useInvite(shareCode);

  if (invite === "loading") {
    return (
      <Frame>
        <p className="mx-auto w-full max-w-content py-20 text-center font-sans text-sm text-driftwood-soft">
          {t("loading")}
        </p>
      </Frame>
    );
  }

  if (invite === "missing") {
    return (
      <Frame>
        <div className="mx-auto w-full max-w-content px-6 py-20 text-center">
          <h1 className="font-display text-[38px] leading-none text-deeptide">
            {t("missingTitle")}
          </h1>
          <p className="mt-3 font-sans text-sm leading-[1.7] text-driftwood-soft">
            {t("missingBody")}
          </p>
          <Link
            href="/"
            className="mt-6 inline-block rounded-pill border border-deeptide/50 px-6 py-3 font-sans text-[14.5px] font-medium leading-none text-deeptide"
          >
            {t("goToInvitation")}
          </Link>
        </div>
      </Frame>
    );
  }

  const events = eventsForTier(invite.tier, config);
  const attending = events.filter((e) => invite.perEventAttendance[e.id]);
  const named = invite.party.filter((m) => m.name.trim().length > 0);
  const host = named[0]?.name.trim();
  // Meals scoped to the days this family is actually here for — a reception-only
  // party has no use for the breakfast that morning.
  const meals = mealsForEvents(attending, config);

  return (
    <Frame>
      <header className="relative bg-[linear-gradient(170deg,var(--color-deeptide)_0%,var(--color-shallows-bright)_55%,var(--color-shallows)_100%)] px-6 pt-12 pb-14 text-center">
        <p className="font-sans text-[9.5px] font-medium uppercase tracking-[0.42em] text-[rgba(251,246,238,0.8)]">
          {t("eyebrow")}
        </p>
        {/* Stacked, like the landing hero. Side by side, a script face at this
            size runs off a 360px phone before the second name even starts. */}
        <p className="mt-4 font-display text-[46px] leading-[0.95] text-[#fff9f0] [text-shadow:0_3px_26px_rgba(15,62,64,0.35)]">
          {COUPLE.partnerA}
        </p>
        <p className="my-1 font-serif text-base font-light italic leading-none text-[#f6d9a8]">
          {tCommon("and")}
        </p>
        <p className="font-display text-[46px] leading-[0.95] text-[#fff9f0] [text-shadow:0_3px_26px_rgba(15,62,64,0.35)]">
          {COUPLE.partnerB}
        </p>
        <p className="mt-4 font-sans text-[12px] uppercase leading-[1.6] tracking-[0.2em] text-[#fff9f0]">
          {weddingDateRangeLabel(tag)}
        </p>
        <p className="mt-1 font-serif text-[14px] font-light leading-[1.5] tracking-[0.06em] text-[rgba(255,249,240,0.9)]">
          {override(tWedding, "destination.label", DESTINATION.label)}
        </p>

        <ScallopEdge className="text-sand" />
      </header>

      <section className="mx-auto w-full max-w-content px-6 pt-7">
        <div className="rounded-card bg-card p-4">
          <p className="font-sans text-[13.5px] leading-[1.6] text-driftwood">
            {host
              ? /* Keyed off the party size, not how many names were typed —
                   unnamed seats are still people this reply covers. The name
                   is emphasised through rich text so the translator keeps
                   control of where in the sentence it lands. */
                t.rich("repliedByHost", {
                  name: host,
                  count: invite.partySize,
                  strong: (chunks) => (
                    <span className="font-medium">{chunks}</span>
                  ),
                })
              : t("repliedAnonymous")}{" "}
            <span className="text-driftwood-soft">{t("nothingToFill")}</span>
          </p>

          {named.length > 0 && (
            <p className="mt-2.5 font-sans text-xs leading-[1.6] text-driftwood-soft">
              {t("replyingFor", {
                names: listNames(
                  named.map((m) => m.name.trim()),
                  tag
                ),
                extra: invite.partySize - named.length,
              })}
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto w-full max-w-content px-6 pt-7">
        <h2 className="mb-4 text-center font-sans text-[9.5px] font-medium uppercase tracking-[0.3em] text-driftwood-faint">
          {attending.length === events.length ? t("theDays") : t("yourDays")}
        </h2>

        <ul className="flex flex-col gap-2.5">
          {events.map((event) => (
            <li key={event.id}>
              <DayCard
                event={event}
                coming={invite.perEventAttendance[event.id] === true}
              />
            </li>
          ))}
        </ul>
      </section>

      {meals.length > 0 && (
        <section className="mx-auto w-full max-w-content px-6 pt-7">
          <h2 className="mb-4 text-center font-sans text-[9.5px] font-medium uppercase tracking-[0.3em] text-driftwood-faint">
            {t("meals")}
          </h2>
          <ul className="flex flex-col gap-2">
            {meals.map((item) => (
              <li key={item.id}>
                <MealRow item={item} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="mx-auto w-full max-w-content px-6 pt-7 pb-12">
        <h2 className="mb-4 text-center font-sans text-[9.5px] font-medium uppercase tracking-[0.3em] text-driftwood-faint">
          {t("gettingThere")}
        </h2>

        {/* Station and airport names stay Latin, same as the landing: a guest
            matches them against a ticket or a signboard. */}
        <div className="flex flex-col gap-2.5">
          <InfoRow
            title={t("trainTo", { station: LOGISTICS.station.name })}
            description={override(
              tWedding,
              "logistics.station.note",
              LOGISTICS.station.note
            )}
          />
          <InfoRow
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
        </div>

        {events[0] && (
          <a
            href={mapsUrl(events[0])}
            target="_blank"
            rel="noreferrer"
            className="mt-2.5 block rounded-pill border border-deeptide/50 py-[15px] text-center font-sans text-[14.5px] font-medium leading-none text-deeptide transition-colors hover:bg-deeptide/7"
          >
            {t("openInMaps")}
          </a>
        )}

        <p className="mt-6 text-center font-sans text-[11.5px] leading-[1.6] text-driftwood-faint">
          {host
            ? t("askHost", { name: host })
            : t("askWhoeverShared")}
        </p>

        <p className="mt-6 text-center font-sans text-[11px] tracking-wide text-driftwood-faint">
          {tCommon("madeBy")}
        </p>
      </section>
    </Frame>
  );
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative w-full overflow-x-hidden bg-sand">
      {children}
    </main>
  );
}

function DayCard({ event, coming }: { event: WeddingEvent; coming: boolean }) {
  const t = useTranslations("shared");
  const tWedding = useTranslations("wedding");
  const tag = useLocaleTag();
  const copy = eventCopy(tWedding, event);

  return (
    <div
      className={`flex items-center gap-3.5 rounded-card bg-card px-4 py-3.5 ${
        coming ? "" : "opacity-45"
      }`}
    >
      <span
        className={`grid size-[34px] flex-none place-items-center rounded-full font-sans text-xs font-medium text-foam ${
          ACCENT_FILL[event.accent]
        }`}
      >
        {eventDayNumber(event.startsAt)}
      </span>
      <span className="flex-1">
        <span className="block font-display text-[26px] leading-none text-driftwood">
          {copy.name}
        </span>
        <span className="mt-1 block font-sans text-xs leading-[1.4] text-driftwood-soft">
          {formatEventWhen(event.startsAt, tag)} · {copy.venueShort} ·{" "}
          {copy.dressCode}
        </span>
      </span>
      {/* Not a control — a record of what was already answered. Anyone who
          wants it changed has to go back to the person who replied. */}
      <span className="font-sans text-[9px] font-medium uppercase tracking-[0.16em] text-driftwood-faint">
        {coming ? t("going") : t("notGoing")}
      </span>
    </div>
  );
}

function MealRow({ item }: { item: ScheduleItem }) {
  const tWedding = useTranslations("wedding");
  const tag = useLocaleTag();
  const copy = scheduleCopy(tWedding, item);

  return (
    <div className="flex items-baseline gap-3 rounded-card bg-card px-4 py-2.5">
      <span className="flex-1 font-sans text-[14px] leading-tight text-driftwood">
        {copy.name}
        {/* Its own line: inline, "Served during the Sangeet" wraps under the
            time column and collides with it on a narrow phone. */}
        {copy.note && (
          <span className="mt-0.5 block font-sans text-[11px] leading-snug text-driftwood-faint">
            {copy.note}
          </span>
        )}
      </span>
      <span className="flex-none font-sans text-xs tabular-nums text-driftwood-soft">
        {formatEventWhen(item.startsAt, tag)}
      </span>
    </div>
  );
}

function InfoRow({
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

interface SharedParty {
  name: string;
  ageGroup: string;
}

interface Invite {
  tier: Tier;
  party: SharedParty[];
  partySize: number;
  perEventAttendance: Record<string, boolean>;
}

/**
 * Re-validates everything on the way in. The document is written by the
 * callable, but this route is reachable with any string in the URL, so a miss
 * and a malformed document have to land in the same honest "we can't find that"
 * rather than throwing.
 */
function useInvite(shareCode: string): Invite | "loading" | "missing" {
  const [state, setState] = useState<Invite | "loading" | "missing">("loading");

  useEffect(() => {
    let live = true;

    (async () => {
      try {
        const { db } = getFirebase();
        const snap = await getDoc(doc(db, "invites", shareCode));
        if (!live) return;

        const data = snap.data();
        if (!snap.exists() || !data || !isTier(data.tier)) {
          setState("missing");
          return;
        }

        const party = Array.isArray(data.party)
          ? (data.party as Record<string, unknown>[]).map((m) => ({
              name: typeof m?.name === "string" ? m.name : "",
              ageGroup: m?.ageGroup === "child" ? "child" : "adult",
            }))
          : [];

        const stored = (data.perEventAttendance ?? {}) as Record<
          string,
          unknown
        >;

        setState({
          tier: data.tier,
          party,
          partySize:
            typeof data.partySize === "number" ? data.partySize : party.length,
          perEventAttendance: Object.fromEntries(
            Object.entries(stored).map(([id, v]) => [id, v === true])
          ),
        });
      } catch {
        if (live) setState("missing");
      }
    })();

    return () => {
      live = false;
    };
  }, [shareCode]);

  return state;
}

/**
 * "Asha", "Asha and Ravi", "Asha, Ravi and Meera".
 *
 * `Intl.ListFormat` rather than a hand-joined string: the conjunction and the
 * separators differ by language (Hindi puts "और" where Odia puts "ଏବଂ"), and
 * this is the one place a translated catalogue can't reach — the words sit
 * between values, not around them.
 */
function listNames(names: string[], locale: string): string {
  if (names.length <= 1) return names[0] ?? "";
  return new Intl.ListFormat(locale, {
    style: "long",
    type: "conjunction",
  }).format(names);
}
