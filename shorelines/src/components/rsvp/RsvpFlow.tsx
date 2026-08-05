"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, type ConfirmationResult } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "@/lib/firebase/client";
import { resetVerifier, sendOtp, toE164 } from "@/lib/firebase/auth";
import {
  COUPLE,
  DESTINATION,
  eventsForGuest,
  isTier,
  normaliseDietary,
  type DietaryOption,
  type Tier,
} from "@/content/wedding";
import {
  emptyTravel,
  hydrateParty,
  hydrateTravel,
  makeMember,
  STEPS,
  type PartyMember,
  type Screen,
  type Travel,
} from "./types";
import { StepDays } from "./steps/StepDays";
import { StepDone } from "./steps/StepDone";
import { StepIdentity } from "./steps/StepIdentity";
import { StepParty } from "./steps/StepParty";
import { StepTable } from "./steps/StepTable";
import { StepTravel } from "./steps/StepTravel";

const RECAPTCHA_CONTAINER_ID = "shorelines-recaptcha";

/**
 * The RSVP, laid out as screen 1c of the identity file: fixed chrome at the
 * top, a single scrolling step in the middle, one sticky action at the bottom.
 *
 * The flow owns the viewport (h-dvh) rather than sitting in the page flow.
 * That is what puts the sticky CTA where the mockup puts it — under the thumb,
 * clear of the home indicator — instead of at the end of the document.
 */
export function RsvpFlow({ tier }: { tier: Tier }) {
  // The tier on a guest's stored RSVP outranks the link they arrived on. The
  // server already refuses to change a stored tier, so without this a guest
  // with a full invite who opens someone else's reception-only link would be
  // shown one event and quietly narrow their own saved reply.
  const [storedTier, setStoredTier] = useState<Tier | null>(null);
  const effectiveTier = storedTier ?? tier;

  // The speakeasy is invitation-only and revealed by a flag the couple sets on
  // this guest's own document. It can only ever be true after the stored RSVP
  // has been read back — there is no link, code or prop that turns it on.
  const [speakeasyInvited, setSpeakeasyInvited] = useState(false);

  const events = useMemo(
    () => eventsForGuest(effectiveTier, { speakeasyInvited }),
    [effectiveTier, speakeasyInvited]
  );

  // Minted by the callable on first submission; the QR on the done screen
  // points at it. Null until they've actually replied.
  const [shareCode, setShareCode] = useState<string | null>(null);

  const [screen, setScreen] = useState<Screen>("you");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null
  );
  const [verifiedPhone, setVerifiedPhone] = useState<string | null>(null);

  const [attending, setAttending] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(events.map((e) => [e.id, true]))
  );
  const [party, setParty] = useState<PartyMember[]>(() => [makeMember()]);
  const [notes, setNotes] = useState("");
  const [travel, setTravel] = useState<Travel>(emptyTravel);

  // The reCAPTCHA verifier holds a live DOM binding; leaving it attached across
  // an unmount makes any later retry fail with a stale-widget error.
  useEffect(() => resetVerifier, []);

  // Firebase persists the phone session, so a guest coming back to change their
  // reply is still signed in. Sending them through the OTP again would be a
  // wall in front of a flow the design opens with "Which days?".
  useEffect(() => {
    const { auth, db } = getFirebase();
    return onAuthStateChanged(auth, async (user) => {
      if (!user) return;
      setVerifiedPhone(user.phoneNumber);
      setScreen((current) => (current === "you" ? "days" : current));

      // Rules allow a guest to read only their own doc, keyed by uid.
      const snap = await getDoc(doc(db, "rsvps", user.uid));
      if (!snap.exists()) return;
      const stored = snap.data();

      const nextTier = isTier(stored.tier) ? stored.tier : tier;
      if (isTier(stored.tier)) setStoredTier(stored.tier);

      const invited = stored.speakeasyInvited === true;
      setSpeakeasyInvited(invited);
      if (typeof stored.shareCode === "string") setShareCode(stored.shareCode);

      const storedParty = hydrateParty(stored.party, normaliseDietary);
      if (storedParty) setParty(storedParty);

      // Keyed off the stored tier's events, not the link's: a broader stored
      // tier has events the current `attending` map doesn't know about yet.
      const previous = (stored.perEventAttendance ?? {}) as Record<
        string,
        unknown
      >;
      setAttending(
        Object.fromEntries(
          eventsForGuest(nextTier, { speakeasyInvited: invited }).map((e) => [
            e.id,
            previous[e.id] === true,
          ])
        )
      );

      if (typeof stored.notes === "string") setNotes(stored.notes);
      setTravel(hydrateTravel(stored.travel));
    });
  }, [tier]);

  const attendingCount = events.filter((e) => attending[e.id]).length;
  const declining = attendingCount === 0;

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { functions } = getFirebase();
      const call = httpsCallable<unknown, { shareCode?: string }>(
        functions,
        "submitRsvp"
      );

      const response = await call({
        // Sent only so the server can set it on FIRST creation. On any later
        // submission the server ignores this and keeps the stored tier.
        tier: effectiveTier,
        language: "en",
        party: party.map(({ name, ageGroup, dietary }) => ({
          name: name.trim(),
          ageGroup,
          dietary,
        })),
        perEventAttendance: attending,
        notes: notes.trim() || null,
        travel,
      });

      if (response.data?.shareCode) setShareCode(response.data.shareCode);
      setScreen("done");
    } catch (err) {
      setError(
        err instanceof Error
          ? `We couldn't save that: ${err.message}`
          : "We couldn't save that."
      );
    } finally {
      setBusy(false);
    }
  }, [attending, effectiveTier, notes, party, travel]);

  const advance = useCallback(async () => {
    setError(null);

    // --- identity gate -----------------------------------------------------
    if (screen === "you" && !confirmation) {
      const e164 = toE164(phone);
      if (!e164) {
        setError("Enter a valid mobile number, or include the country code.");
        return;
      }
      setBusy(true);
      try {
        setConfirmation(await sendOtp(e164, RECAPTCHA_CONTAINER_ID));
      } catch (err) {
        setError(
          err instanceof Error
            ? `Could not send the code: ${err.message}`
            : "Could not send the code."
        );
      } finally {
        setBusy(false);
      }
      return;
    }

    if (screen === "you") {
      setBusy(true);
      try {
        await confirmation!.confirm(code.trim());
        setScreen("days");
      } catch {
        setError("That code didn't match. Check it and try again.");
      } finally {
        setBusy(false);
      }
      return;
    }

    // --- the four numbered steps -------------------------------------------
    if (screen === "days") {
      // Declining is a complete answer — there is nothing to ask about seats,
      // menus or airport pickups, so skip straight to saving it.
      if (declining) await submit();
      else setScreen("party");
      return;
    }

    if (screen === "party") {
      if (!party[0].name.trim()) {
        setError("Add your name so we know whose reply this is.");
        return;
      }
      setScreen("table");
      return;
    }

    if (screen === "table") {
      setScreen("travel");
      return;
    }

    if (screen === "travel") await submit();
  }, [code, confirmation, declining, party, phone, screen, submit]);

  const back = useCallback(() => {
    setError(null);
    if (screen === "travel") setScreen("table");
    else if (screen === "table") setScreen("party");
    else if (screen === "party") setScreen("days");
  }, [screen]);

  // Identity can't be re-entered once verified, and "days" is the first screen
  // after it, so neither has anywhere to go back to.
  const canGoBack =
    screen === "party" || screen === "table" || screen === "travel";

  const stepIndex = STEPS.indexOf(screen as (typeof STEPS)[number]);
  const inFlow = stepIndex >= 0;

  const ctaLabel = (() => {
    if (screen === "you") return confirmation ? "Verify" : "Send code";
    if (screen === "days") return declining ? "Send regrets" : "Next";
    if (screen === "travel") return "Send RSVP";
    return "Next";
  })();

  return (
    <div className="mx-auto flex h-dvh w-full max-w-md flex-col bg-sand">
      {screen !== "done" && (
        <header className="flex-none px-6 pt-4 pb-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              aria-label="Back"
              className={`w-8 text-left font-sans text-[22px] leading-none text-driftwood-soft ${
                canGoBack ? "" : "pointer-events-none opacity-0"
              }`}
            >
              ‹
            </button>

            <span className="font-sans text-[9.5px] font-medium uppercase tracking-[0.3em] text-driftwood-faint">
              RSVP
            </span>

            <span className="w-8 text-right font-sans text-xs tabular-nums text-driftwood-faint">
              {inFlow ? `${stepIndex + 1}/${STEPS.length}` : ""}
            </span>
          </div>

          <div
            className="mt-4 flex gap-1.5"
            role="progressbar"
            aria-valuenow={Math.max(stepIndex + 1, 0)}
            aria-valuemin={0}
            aria-valuemax={STEPS.length}
            aria-label="RSVP progress"
          >
            {STEPS.map((step, i) => (
              <span
                key={step}
                className={`h-[3px] flex-1 rounded-sm transition-colors ${
                  inFlow && i <= stepIndex ? "bg-deeptide" : "bg-shell"
                }`}
              />
            ))}
          </div>
        </header>
      )}

      {/* overflow-x-hidden contains the done screen's full-bleed banner, which
          cancels this padding with negative margins and would otherwise widen
          the scroll area by 48px. */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-5">
        {screen === "you" && (
          <>
            <div className="pb-6 text-center">
              <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-driftwood-faint">
                {DESTINATION.shortLabel}
              </p>
              <p className="mt-2 font-display text-[34px] leading-none text-deeptide">
                {COUPLE.partnerA} &amp; {COUPLE.partnerB}
              </p>
            </div>

            <StepIdentity
              phone={phone}
              onPhoneChange={setPhone}
              code={code}
              onCodeChange={setCode}
              awaitingCode={Boolean(confirmation)}
              onUseAnotherNumber={() => {
                resetVerifier();
                setConfirmation(null);
                setCode("");
                setError(null);
              }}
            />
          </>
        )}

        {screen === "days" && (
          <StepDays
            events={events}
            attending={attending}
            onToggle={(id) =>
              setAttending((prev) => ({ ...prev, [id]: !prev[id] }))
            }
          />
        )}

        {screen === "party" && (
          <StepParty
            phoneLabel={verifiedPhone ?? toE164(phone) ?? phone}
            party={party}
            onChange={setParty}
          />
        )}

        {screen === "table" && (
          <StepTable
            party={party}
            eventCount={attendingCount}
            onDefaultDietary={(option) =>
              setParty((prev) => prev.map((m) => ({ ...m, dietary: option })))
            }
            onMemberDietary={(id, option) =>
              setParty((prev) =>
                prev.map((m) =>
                  m.id === id ? { ...m, dietary: option as DietaryOption } : m
                )
              )
            }
            notes={notes}
            onNotesChange={setNotes}
          />
        )}

        {screen === "travel" && (
          <StepTravel travel={travel} onChange={setTravel} />
        )}

        {screen === "done" && (
          <StepDone
            party={party}
            attendingCount={attendingCount}
            totalEvents={events.length}
            travel={travel}
            declined={declining}
            shareCode={shareCode}
            onEdit={() => setScreen("days")}
          />
        )}

        {error && (
          <p
            role="alert"
            className="mt-4 rounded-card bg-coral/15 px-4 py-3 font-sans text-sm text-coral-ink"
          >
            {error}
          </p>
        )}

        {screen === "you" && (
          <p className="pt-8 text-center font-sans text-[11px] tracking-wide text-driftwood-faint">
            Made by ARBriterrey
          </p>
        )}
      </div>

      {screen !== "done" && (
        <div className="flex-none bg-gradient-to-b from-transparent to-sand to-40% px-6 pt-3.5 pb-[26px]">
          <button
            type="button"
            onClick={advance}
            disabled={busy}
            className="w-full rounded-pill bg-coral py-4 font-sans text-[15px] font-medium leading-none tracking-[0.03em] text-foam shadow-[0_8px_22px_rgba(226,138,118,0.38)] transition-colors hover:bg-coral-deep disabled:opacity-60"
          >
            {busy ? "One moment…" : ctaLabel}
          </button>
        </div>
      )}

      {/* Invisible reCAPTCHA mounts here. Must exist before sendOtp runs. */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </div>
  );
}
