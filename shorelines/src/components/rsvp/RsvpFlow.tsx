"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import {
  onAuthStateChanged,
  signInWithCustomToken,
  type User,
} from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { getFirebase } from "@/lib/firebase/client";
import { toE164 } from "@/lib/firebase/auth";
import {
  COUPLE,
  DESTINATION,
  eventsForTier,
  isTier,
  normaliseDietary,
  tierCode,
  type DietaryOption,
  type Tier,
  type WeddingConfig,
} from "@/content/wedding";
import { markReplied } from "@/lib/guest/replied";
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
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { BOTTOM_TAB_BAR_HEIGHT } from "@/components/nav/BottomTabBar";
import { AppShell } from "@/components/layout/AppShell";
import { override } from "@/i18n/weddingCopy";
import { StepDays } from "./steps/StepDays";
import { StepDone } from "./steps/StepDone";
import { StepParty } from "./steps/StepParty";
import { StepPhone } from "./steps/StepPhone";
import { StepTable } from "./steps/StepTable";
import { StepTravel } from "./steps/StepTravel";

/**
 * The RSVP, laid out as screen 1c of the identity file: fixed chrome at the
 * top, a single scrolling step in the middle, one sticky action at the bottom.
 *
 * The flow owns the viewport (h-dvh) rather than sitting in the page flow.
 * That is what puts the sticky CTA where the mockup puts it — under the thumb,
 * clear of the home indicator — instead of at the end of the document.
 */

// See the sign-in effect below for why this has to live outside the component.
let signInStarted = false;

/**
 * Whether this session is one an RSVP may be filed under.
 *
 * A recovery-code sign-in passes too — it's a custom token minted for the
 * guest's own phone-derived uid, so it lands on the same document.
 */
function isVerified(user: User | null): user is User {
  return user !== null && !user.isAnonymous;
}

export function RsvpFlow({
  tier,
  config,
  recoverCode,
  live,
}: {
  tier: Tier;
  /**
   * The live config — the literal with the couple's runtime edits merged over
   * it — resolved on the server by `/rsvp/page.tsx` and passed down. This is a
   * client component, so it cannot do that read itself; taking the config as a
   * prop is what stops the day-picker rendering times that were true at build.
   */
  config: WeddingConfig;
  /**
   * A one-time recovery code from `?recover=`, read server-side. Present only
   * when a guest opened a recovery link on a new device; null on every
   * ordinary visit.
   */
  recoverCode: string | null;
  /**
   * Whether Event mode is live — computed server-side the same way `/` and
   * the other gated routes do, and forwarded to `BottomTabBar` so the
   * Chat/Photos tabs don't appear before there's anything there.
   */
  live: boolean;
}) {
  const t = useTranslations("rsvp");
  const tCommon = useTranslations("common");
  const tWedding = useTranslations("wedding");
  const locale = useLocale();

  // The tier on a guest's stored RSVP outranks the link they arrived on. The
  // server already refuses to change a stored tier, so without this a guest
  // with a full invite who opens someone else's reception-only link would be
  // shown one event and quietly narrow their own saved reply.
  const [storedTier, setStoredTier] = useState<Tier | null>(null);
  const effectiveTier = storedTier ?? tier;

  const events = useMemo(
    () => eventsForTier(effectiveTier, config),
    [effectiveTier, config]
  );

  // Minted by the callable on first submission; the QR on the done screen
  // points at it. Null until they've actually replied.
  const [shareCode, setShareCode] = useState<string | null>(null);

  // Minted alongside shareCode, but never mirrored anywhere public — it's a
  // bearer credential (recoverRsvp trades it for a sign-in token), so it lives
  // only in memory and in whatever link the guest chooses to save.
  const [recoveryCode, setRecoveryCode] = useState<string | null>(null);

  const [screen, setScreen] = useState<Screen>("loading");
  // True until sign-in and the stored-doc read below both resolve, so the
  // sticky CTA reads "One moment…" instead of a label for a screen ("days")
  // that hasn't actually loaded yet.
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // The number the couple should call on, captured on the party step — seeded
  // from the verified number below, but editable, since the person filling the
  // form isn't always the one who should be rung. Distinct from identity: the
  // verified claim is read server-side in submitRsvp, never from here.
  const [phone, setPhone] = useState("");

  const [attending, setAttending] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(events.map((e) => [e.id, true]))
  );
  const [party, setParty] = useState<PartyMember[]>(() => [makeMember()]);
  const [notes, setNotes] = useState("");
  const [travel, setTravel] = useState<Travel>(emptyTravel);

  // A recovery code is a one-time bearer credential — once it's been read
  // server-side and handed down as a prop, it has no business sitting in the
  // address bar (browser history, a screenshot, a "back" button after it's
  // spent). Stripped unconditionally, whether or not the exchange below
  // succeeds.
  useEffect(() => {
    if (!recoverCode) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("recover");
    window.history.replaceState(null, "", url);
  }, [recoverCode]);

  // Establishes who this browser is talking to Firestore as. A recovery code
  // exchanges for the guest's existing uid via a custom token; everyone else
  // verifies a phone number on the gate screen. Either way this only runs once:
  // if Firebase already restored a session for this browser — which is the
  // common case on a return visit — onAuthStateChanged below fires with it and
  // there is nothing to establish.
  //
  // authStateReady() is what keeps a returning guest off the gate. currentUser
  // is null until persistence has been read back, so deciding "no identity"
  // synchronously would ask someone who is already signed in to verify again.
  //
  // An anonymous session counts as no identity here, not as a session to keep.
  // /polls, /memories and /photos each sign in anonymously so a guest can use
  // them without replying first, and that session persists — without this, a
  // guest who voted in a poll before opening the invite would walk past the
  // gate entirely and file an unverified reply.
  //
  // signInStarted is module-level, not a ref: Strict Mode double-invokes this
  // effect before the async work resolves, so `auth.currentUser` is still null
  // both times and a per-instance guard reset by the first invoke's own cleanup
  // wouldn't close the window — same pattern as connectEmulatorsOnce.
  useEffect(() => {
    const { auth, functions } = getFirebase();
    if (isVerified(auth.currentUser) || signInStarted) return;
    signInStarted = true;

    void (async () => {
      if (recoverCode) {
        try {
          const call = httpsCallable<{ code: string }, { token: string }>(
            functions,
            "recoverRsvp"
          );
          const { data } = await call({ code: recoverCode });
          await signInWithCustomToken(auth, data.token);
          return;
        } catch {
          // An invalid or already-consumed code falls through to the phone gate
          // rather than stranding the guest on a dead end — verifying the
          // number they replied with lands them back on the same reply anyway.
        }
      }

      await auth.authStateReady();
      if (isVerified(auth.currentUser)) return;

      setBusy(false);
      setScreen((current) => (current === "loading" ? "phone" : current));
    })();
  }, [recoverCode]);

  // A guest with nothing stored yet still needs the wizard, so they land on
  // "days" as soon as we're sure there's no reply to show instead. A guest who
  // already replied lands on "done" — the same read-only summary they saw
  // right after submitting, with "Change my reply" as the explicit way in —
  // rather than being dropped straight back into edit mode.
  useEffect(() => {
    const { auth, db } = getFirebase();
    return onAuthStateChanged(auth, async (user) => {
      // Anonymous is left to the gate above, not resolved here — reading
      // rsvps/{anonUid} would find nothing and hand them the wizard.
      if (!isVerified(user)) return;

      // Rules allow a guest to read only their own doc, keyed by uid.
      const snap = await getDoc(doc(db, "rsvps", user.uid));
      if (!snap.exists()) {
        // They just verified this number, so asking for it again on the party
        // step is asking twice. Editable there — the contact number isn't
        // always the number that replied.
        if (user.phoneNumber) setPhone(user.phoneNumber);
        setBusy(false);
        setScreen((current) =>
          current === "loading" || current === "phone" ? "days" : current
        );
        return;
      }
      const stored = snap.data();

      const nextTier = isTier(stored.tier) ? stored.tier : tier;
      if (isTier(stored.tier)) setStoredTier(stored.tier);

      if (typeof stored.shareCode === "string") setShareCode(stored.shareCode);
      if (typeof stored.recoveryCode === "string")
        setRecoveryCode(stored.recoveryCode);
      if (typeof stored.submittedByPhone === "string")
        setPhone(stored.submittedByPhone);

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
          eventsForTier(nextTier, config).map((e) => [e.id, previous[e.id] === true])
        )
      );

      if (typeof stored.notes === "string") setNotes(stored.notes);
      setTravel(hydrateTravel(stored.travel));
      // See `markReplied` — this is what makes `/` send them to Today next time.
      markReplied(tierCode(nextTier));
      setBusy(false);
      setScreen((current) =>
        current === "loading" || current === "phone" ? "done" : current
      );
    });
  }, [tier, config]);

  const attendingCount = events.filter((e) => attending[e.id]).length;
  const declining = attendingCount === 0;

  const submit = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const { functions } = getFirebase();
      const call = httpsCallable<
        unknown,
        { shareCode?: string; recoveryCode?: string }
      >(functions, "submitRsvp");

      const response = await call({
        // Sent only so the server can set it on FIRST creation. On any later
        // submission the server ignores this and keeps the stored tier.
        tier: effectiveTier,
        // The language they actually replied in, so the couple can send this
        // family a WhatsApp message they can read.
        language: locale,
        party: party.map(({ name, ageGroup, dietary }) => ({
          name: name.trim(),
          ageGroup,
          dietary,
        })),
        perEventAttendance: attending,
        notes: notes.trim() || null,
        travel,
        // The couple's way to call, nothing more. Identity comes from the
        // verified phone claim on the token, which the server reads itself.
        phone: toE164(phone) ?? (phone.trim() || null),
      });

      if (response.data?.shareCode) setShareCode(response.data.shareCode);
      if (response.data?.recoveryCode)
        setRecoveryCode(response.data.recoveryCode);
      // `effectiveTier` and not the link's: the server has just fixed the
      // stored tier to this, and it's the one `/` should redirect on.
      markReplied(tierCode(effectiveTier));
      setScreen("done");
    } catch (err) {
      // The Firebase message is English and untranslatable, but it's the only
      // thing that tells the couple what actually failed when a guest reads it
      // out over the phone. Keep it, framed by a sentence they can read.
      setError(
        err instanceof Error
          ? `${t("errors.saveFailed")} ${err.message}`
          : t("errors.saveFailed")
      );
    } finally {
      setBusy(false);
    }
  }, [attending, effectiveTier, locale, notes, party, phone, t, travel]);

  const advance = useCallback(async () => {
    setError(null);

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
        setError(t("errors.nameRequired"));
        return;
      }
      // The contact number is optional, but a value that's been typed and
      // doesn't parse is a mistake worth catching before it reaches the
      // couple's dashboard as an unreachable number.
      if (phone.trim() && !toE164(phone)) {
        setError(t("errors.badNumber"));
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
  }, [declining, party, phone, screen, submit, t]);

  const back = useCallback(() => {
    setError(null);
    if (screen === "travel") setScreen("table");
    else if (screen === "table") setScreen("party");
    else if (screen === "party") setScreen("days");
  }, [screen]);

  // "days" is the first screen of the wizard proper. Going back from it would
  // mean back to the phone gate, and the guest is already verified by then —
  // there is nothing there to return to.
  const canGoBack =
    screen === "party" || screen === "table" || screen === "travel";

  const stepIndex = STEPS.indexOf(screen as (typeof STEPS)[number]);
  const inFlow = stepIndex >= 0;

  const ctaLabel = (() => {
    if (screen === "days") return t(declining ? "cta.sendRegrets" : "cta.next");
    if (screen === "travel") return t("cta.sendRsvp");
    return t("cta.next");
  })();

  return (
    <AppShell tab={screen === "done" ? "rsvp" : undefined} tier={effectiveTier} live={live}>
      {screen !== "done" && screen !== "loading" && screen !== "phone" && (
        <header className="flex-none px-6 pt-4 pb-4">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={back}
              aria-label={t("back")}
              className={`w-8 text-left font-sans text-[22px] leading-none text-driftwood-soft ${
                canGoBack ? "" : "pointer-events-none opacity-0"
              }`}
            >
              ‹
            </button>

            <span className="font-sans text-[9.5px] font-medium uppercase tracking-[0.3em] text-driftwood-faint">
              {t("title")}
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
            aria-label={t("progress")}
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
      <div
        className="flex-1 overflow-y-auto overflow-x-hidden px-6 pb-5"
        style={
          screen === "done"
            ? { paddingBottom: BOTTOM_TAB_BAR_HEIGHT + 24 }
            : undefined
        }
      >
        {screen === "loading" && (
          <div className="flex h-full min-h-[50vh] items-center justify-center">
            <p className="font-sans text-xs uppercase tracking-[0.28em] text-driftwood-faint">
              {t("loading")}
            </p>
          </div>
        )}

        {screen === "phone" && <StepPhone />}

        {screen === "days" && (
          <>
            {/* Repeated from the phone gate on purpose: a guest whose session
                persisted but who never finished the wizard reaches "days"
                without passing the gate, and this is their only chance to
                switch. Past this point they've already chosen, and a language
                control beside the form fields is one more thing to mis-tap. */}
            <LanguageSwitcher className="justify-center pb-5" />

            <div className="pb-6 text-center">
              <p className="font-sans text-[10px] uppercase tracking-[0.28em] text-driftwood-faint">
                {override(
                  tWedding,
                  "destination.shortLabel",
                  DESTINATION.shortLabel
                )}
              </p>
              <p className="mt-2 font-display text-[34px] leading-none text-deeptide">
                {COUPLE.partnerA} &amp; {COUPLE.partnerB}
              </p>
            </div>

            <StepDays
              events={events}
              attending={attending}
              onToggle={(id) =>
                setAttending((prev) => ({ ...prev, [id]: !prev[id] }))
              }
            />
          </>
        )}

        {screen === "party" && (
          <StepParty phone={phone} onPhoneChange={setPhone} party={party} onChange={setParty} />
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
            recoveryCode={recoveryCode}
            tier={effectiveTier}
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

        {screen === "days" && (
          <p className="pt-8 text-center font-sans text-[11px] tracking-wide text-driftwood-faint">
            {tCommon("madeBy")}
          </p>
        )}
      </div>

      {screen !== "done" && screen !== "loading" && screen !== "phone" && (
        <div className="flex-none bg-gradient-to-b from-transparent to-sand to-40% px-6 pt-3.5 pb-[26px]">
          <button
            type="button"
            onClick={advance}
            disabled={busy}
            className="w-full rounded-pill bg-coral py-4 font-sans text-[15px] font-medium leading-none tracking-[0.03em] text-foam shadow-[0_8px_22px_rgba(226,138,118,0.38)] transition-colors hover:bg-coral-deep disabled:opacity-60"
          >
            {busy ? t("cta.busy") : ctaLabel}
          </button>
        </div>
      )}
    </AppShell>
  );
}
