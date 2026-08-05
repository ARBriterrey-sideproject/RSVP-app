import {
  COUPLE,
  DESTINATION,
  DIETARY_COPY,
  TRANSPORT_COPY,
  WEDDING_DATES,
  rsvpDeadlineLabel,
} from "@/content/wedding";
import { FamilyShare } from "../FamilyShare";
import type { PartyMember, Travel } from "../types";
import { Eyebrow, ScallopEdge } from "../ui";

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
  onEdit,
}: {
  party: PartyMember[];
  attendingCount: number;
  totalEvents: number;
  travel: Travel;
  declined: boolean;
  /** Null until the callable has minted one — see FamilyShare. */
  shareCode: string | null;
  onEdit: () => void;
}) {
  const shared = party.every((m) => m.dietary === party[0].dietary)
    ? DIETARY_COPY[party[0].dietary].label
    : "Mixed";

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
            {declined ? "Reply received" : "You're on the list"}
          </div>
        </div>

        <ScallopEdge className="text-sand" />
      </div>

      <h2 className="mt-3.5 font-display text-[40px] leading-[1.05] text-deeptide">
        {declined ? "We'll miss you" : `See you in ${DESTINATION.region}`}
      </h2>

      <p className="mt-2.5 font-sans text-sm leading-[1.7] text-driftwood-soft">
        {declined ? (
          <>
            {COUPLE.partnerA} and {COUPLE.partnerB} will know. If anything
            changes, come back and say so — nothing is final until{" "}
            {/* No locale argument: the default en-IN gives "1 February", which
                is what the party step already says. */}
            {rsvpDeadlineLabel()}.
          </>
        ) : (
          // The mockup opens with "A confirmation is on its way" — we never ask
          // for an email, so nothing is on its way. The rest is the design's.
          <>
            Your reply is saved. We&apos;ll nudge you the week before with
            pickup times and dress codes.
          </>
        )}
      </p>

      <div className="mt-5 rounded-card bg-card p-4 text-left">
        <Eyebrow className="mb-2.5">Your reply</Eyebrow>
        <SummaryRow
          label="Events"
          value={declined ? "Not attending" : `${attendingCount} of ${totalEvents}`}
        />
        {!declined && (
          <>
            <SummaryRow
              label="Party"
              value={`${party.length} ${party.length === 1 ? "guest" : "guests"}`}
            />
            <SummaryRow label="Menu" value={shared} />
            {/* Travel is entirely optional, so each row only appears once the
                guest has actually told us something. A summary that lists
                "Arriving —" reads like a form they failed to finish. */}
            {travel.arrivalOn && (
              <SummaryRow label="Arriving" value={dayLabel(travel.arrivalOn)} />
            )}
            {travel.mode && (
              <SummaryRow
                label="Coming by"
                value={TRANSPORT_COPY[travel.mode].label}
              />
            )}
            {travel.wantsPickup && (
              <SummaryRow label="Pickup" value="Yes, please" />
            )}
          </>
        )}
      </div>

      {/* Nothing to share when they've declined — a QR onto "not attending" is
          just a way to make someone feel bad twice. */}
      {!declined && shareCode && <FamilyShare shareCode={shareCode} />}

      <button
        type="button"
        onClick={onEdit}
        className="mt-[22px] font-sans text-xs font-medium uppercase tracking-[0.14em] text-coral-ink"
      >
        Change my reply
      </button>
    </div>
  );
}

/** "28 Dec" from a `YYYY-MM-DD` value, read in the wedding's own timezone. */
function dayLabel(isoDate: string): string {
  const date = new Date(`${isoDate}T12:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return isoDate;
  return new Intl.DateTimeFormat("en-IN", {
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
