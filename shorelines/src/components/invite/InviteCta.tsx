"use client";

/**
 * The landing's one call to action, and the only thing on that page that knows
 * whether this guest has already replied.
 *
 * The couple hit the gap it closes: they RSVPed, closed the tab, reopened the
 * link, and were shown the invitation again with "RSVP for your family" on it —
 * no sign the app remembered them. It did; `/rsvp` puts a returning verified
 * guest straight on their confirmation. The landing simply had no idea, because
 * it is a server component with no session to read.
 *
 * So this is a small client island rather than a `"use client"` on the landing
 * itself. `InviteLanding`'s doc comment asks for exactly that: everything else
 * on that page is static HTML plus CSS animation, and putting state on the page
 * would give up the whole arrangement to answer one question at the bottom.
 *
 * Before the lookup settles it renders the plain CTA, which is both what a
 * first-time visitor gets and what avoids a card appearing under someone's
 * thumb mid-tap. A guest with no session settles to "not replied" — see
 * `useGuestRsvp`.
 */

import Link from "next/link";
import { useTranslations } from "next-intl";
import { rsvpHref, type Tier } from "@/content/wedding";
import { useGuestRsvp } from "@/components/today/useGuestRsvp";

const CTA_CLASS =
  "rounded-pill bg-coral p-4 font-sans text-[14.5px] font-medium leading-none tracking-[0.04em] text-foam shadow-[0_8px_22px_rgba(226,138,118,0.4)] transition-colors hover:bg-coral-deep";

export function InviteCta({ tier }: { tier: Tier }) {
  const t = useTranslations("landing");
  const { storedTier, guestName, partySize, perEventAttendance, loaded } =
    useGuestRsvp();

  // The tier rides along in the href. Without it the RSVP falls back to `full`
  // and a narrow invite quietly widens itself. A guest who has replied gets
  // their *stored* tier, which is the one the server fixed at first submission
  // and cannot be widened by editing the address bar.
  const href = rsvpHref(storedTier ?? tier);

  if (!loaded || !perEventAttendance) {
    return (
      <Link href={href} className={CTA_CLASS}>
        {t("ctaRsvp")}
      </Link>
    );
  }

  const attending = Object.values(perEventAttendance).some(Boolean);

  return (
    <div className="animate-fade-in rounded-card border border-driftwood/[0.08] bg-foam px-5 py-4.5 text-center">
      <p className="font-serif text-[19px] font-light leading-tight text-driftwood">
        {guestName
          ? t("replied.titleNamed", { name: guestName })
          : t("replied.title")}
      </p>
      <p className="mt-1.5 font-sans text-[13px] leading-[1.6] text-driftwood-soft">
        {attending
          ? t("replied.body", { count: partySize ?? 1 })
          : t("replied.bodyDeclined")}
      </p>
      <Link
        href={href}
        className="mt-3.5 inline-block rounded-pill bg-card px-5 py-3 font-sans text-[13.5px] font-medium leading-none text-driftwood ring-1 ring-hairline/60 transition-colors hover:bg-card-hover"
      >
        {t("replied.cta")}
      </Link>
    </div>
  );
}
