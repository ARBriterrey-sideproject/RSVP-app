"use client";

import { useTranslations } from "next-intl";
import {
  COUPLE,
  DESTINATION,
  LOGISTICS,
  WEDDING_DATES,
  rsvpDeadlineLabel,
} from "@/content/wedding";
import { dietaryCopy, override, transportCopy } from "@/i18n/weddingCopy";
import { useLocaleTag } from "@/i18n/useLocaleTag";
import { FamilyShare } from "../FamilyShare";
import { InstallPrompt } from "../InstallPrompt";
import { RecoveryLink } from "../RecoveryLink";
import type { PartyMember, Travel } from "../types";
import { Eyebrow, ScallopEdge } from "../ui";
import type { Tier } from "@/content/wedding";

/**
 * The confirmation screen from the mockup.
 *
 * The banner is full-bleed (negative margins cancel the scroll area's padding)
 * and the scalloped edge is what makes it read as water meeting sand rather
 * than a coloured box. Both are load-bearing — this is the one screen every
 * guest is guaranteed to see.
 *
 * The mockup only draws the accepting case. A guest who declines gets the same
 * furniture with honest copy: telling someone who just said they can't come
 * "See you in Gopalpur" is the kind of thing that makes an app feel unread.
 */
export function StepDone({
  party,
  attendingCount,
  totalEvents,
  travel,
  declined,
  shareCode,
  recoveryCode,
  tier,
  onEdit,
}: {
  party: PartyMember[];
  attendingCount: number;
  totalEvents: number;
  travel: Travel;
  declined: boolean;
  /** Null until the callable has minted one — see FamilyShare. */
  shareCode: string | null;
  /** Null until the callable has minted one — see RecoveryLink. */
  recoveryCode: string | null;
  tier: Tier;
  onEdit: () => void;
}) {
  const t = useTranslations("rsvp.done");
  const tWedding = useTranslations("wedding");
  const tag = useLocaleTag();

  const shared = party.every((m) => m.dietary === party[0].dietary)
    ? dietaryCopy(tWedding, party[0].dietary).title
    : t("mixedMenu");

  return (
    <div className="animate-fade-in pt-5 text-center">
      <div
        className={`relative -mx-6 mb-2 h-[170px] ${
          declined
            ? "bg-[linear-gradient(160deg,var(--color-shallows),var(--color-shell)_60%,var(--color-sunbleach))]"
            : "bg-[linear-gradient(160deg,var(--color-deeptide),var(--color-shallows-bright)_55%,var(--color-shallows))]"
        }`}
      >
        <div className="animate-tide absolute inset-0 bg-[radial-gradient(50%_60%_at_50%_40%,rgba(255,236,200,0.55),transparent_70%)]" />

        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2.5">
          <div className="grid size-14 place-items-center rounded-full bg-[rgba(255,249,240,0.92)] font-sans text-[26px] leading-none text-deeptide">
            ✓
          </div>
          <div
            className={`font-sans text-[9.5px] font-medium uppercase tracking-[0.36em] ${
              declined ? "text-deeptide-deep" : "text-[rgba(255,249,240,0.85)]"
            }`}
          >
            {declined ? t("bannerDeclined") : t("bannerAccepted")}
          </div>
        </div>

        <ScallopEdge className="text-sand" />
      </div>

      <h2 className="mt-3.5 font-display text-[40px] leading-[1.05] text-deeptide">
        {declined
          ? t("headingDeclined")
          : t("headingAccepted", {
              place: override(tWedding, "destination.region", DESTINATION.region),
            })}
      </h2>

      <p className="mt-2.5 font-sans text-sm leading-[1.7] text-driftwood-soft">
        {declined
          ? t("bodyDeclined", {
              partnerA: COUPLE.partnerA,
              partnerB: COUPLE.partnerB,
              date: rsvpDeadlineLabel(tag),
            })
          : // The mockup opens with "A confirmation is on its way" — we never
            // ask for an email, so nothing is on its way. The rest is the
            // design's.
            t("bodyAccepted", { hasShuttle: String(LOGISTICS.shuttle.available) })}
      </p>

      <div className="mt-5 rounded-card bg-card p-4 text-left">
        <Eyebrow className="mb-2.5">{t("yourReply")}</Eyebrow>
        <SummaryRow
          label={t("events")}
          value={
            declined
              ? t("notAttending")
              : t("nOfM", { n: attendingCount, m: totalEvents })
          }
        />
        {!declined && (
          <>
            <SummaryRow
              label={t("partyLabel")}
              value={t("guestCount", { count: party.length })}
            />
            <SummaryRow label={t("menu")} value={shared} />
            {/* Travel is entirely optional, so each row only appears once the
                guest has actually told us something. A summary that lists
                "Arriving —" reads like a form they failed to finish. */}
            {travel.arrivalOn && (
              <SummaryRow
                label={t("arriving")}
                value={dayLabel(travel.arrivalOn, tag)}
              />
            )}
            {travel.mode && (
              <SummaryRow
                label={t("comingBy")}
                value={transportCopy(tWedding, travel.mode).title}
              />
            )}
          </>
        )}
      </div>

      {/* Nothing to share when they've declined — a QR onto "not attending" is
          just a way to make someone feel bad twice. */}
      {!declined && shareCode && <FamilyShare shareCode={shareCode} />}

      {/* Unlike the family QR, this matters whether they're coming or not —
          it's a way back to change either answer without waiting on an SMS,
          and the one that still works from a number they've since lost. */}
      {recoveryCode && <RecoveryLink recoveryCode={recoveryCode} tier={tier} />}
      {recoveryCode && <InstallPrompt recoveryCode={recoveryCode} />}

      <button
        type="button"
        onClick={onEdit}
        className="mt-[22px] font-sans text-xs font-medium uppercase tracking-[0.14em] text-coral-ink"
      >
        {t("changeReply")}
      </button>
    </div>
  );
}

/** "28 Dec" from a `YYYY-MM-DD` value, read in the wedding's own timezone. */
function dayLabel(isoDate: string, locale: string): string {
  // Noon UTC, not midnight: far enough from either boundary that formatting it
  // in the wedding's zone lands on the day the guest picked, whatever that zone
  // is. A hardcoded +05:30 here tied the summary to India.
  const date = new Date(`${isoDate}T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: WEDDING_DATES.timeZone,
  }).format(date);
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between font-sans text-[13.5px] leading-loose text-driftwood">
      <span className="text-driftwood-soft">{label}</span>
      <span>{value}</span>
    </div>
  );
}
