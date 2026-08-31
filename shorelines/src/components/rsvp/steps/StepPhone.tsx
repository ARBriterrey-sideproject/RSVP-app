"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FirebaseError } from "firebase/app";
import type { ConfirmationResult } from "firebase/auth";
import { resetVerifier, sendOtp, toE164 } from "@/lib/firebase/auth";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Card, StepIntro, StepTitle, TextField } from "../ui";

/**
 * The identity gate in front of the wizard.
 *
 * This is where "one phone number, one reply" is actually enforced: Firebase
 * resolves a verified number to the same uid every time, and the RSVP document
 * is keyed by that uid, so a second verification of the same number lands on
 * the existing reply rather than creating a second one. There is no lookup
 * anywhere in the app doing that — it falls out of the provider.
 *
 * Its own buttons rather than the flow's sticky CTA: this screen has two
 * actions of its own (send, then verify) and sits outside the numbered steps,
 * so threading it through `advance()` would mean teaching the wizard a state
 * machine that belongs here.
 */

// Distinct from the dashboard's container id — both could mount in one tab, and
// a shared id would hand the second verifier a node the first already owns.
const RECAPTCHA_CONTAINER_ID = "shorelines-guest-recaptcha";

export function StepPhone() {
  const t = useTranslations("rsvp.phone");

  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => resetVerifier, []);

  const e164 = toE164(phone);

  async function send() {
    setError(null);
    if (!e164) {
      setError(t("errors.badNumber"));
      return;
    }
    setBusy(true);
    try {
      setConfirmation(await sendOtp(e164, RECAPTCHA_CONTAINER_ID));
      setCode("");
    } catch (caught) {
      setError(humanError(caught, t));
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setError(null);
    if (!confirmation) return;
    setBusy(true);
    try {
      // No navigation here on purpose — RsvpFlow's onAuthStateChanged listener
      // is what reads the guest's stored reply and picks the screen, exactly as
      // it does for the recovery-link path.
      await confirmation.confirm(code.trim());
    } catch (caught) {
      setError(humanError(caught, t));
      setBusy(false);
    }
  }

  function editNumber() {
    setError(null);
    setConfirmation(null);
    setCode("");
    resetVerifier();
  }

  return (
    <div className="animate-fade-in">
      {/* The first screen a guest sees, so the switcher lives here — past this
          point they have already chosen, and a language control beside the form
          fields is one more thing to mis-tap. */}
      <LanguageSwitcher className="justify-center pb-5" />

      <StepTitle>{confirmation ? t("codeTitle") : t("title")}</StepTitle>
      <StepIntro>
        {confirmation ? t("codeIntro", { phone: e164 ?? phone }) : t("intro")}
      </StepIntro>

      <Card className="mt-[22px]">
        {confirmation ? (
          <TextField
            label={t("codeLabel")}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="bg-white/70 px-3 py-2.5 tracking-[0.3em]"
          />
        ) : (
          <TextField
            label={t("numberLabel")}
            type="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="bg-white/70 px-3 py-2.5"
          />
        )}
        <p className="mt-2 font-sans text-[12.5px] leading-snug text-driftwood-soft">
          {confirmation ? t("codeHint") : t("numberHint")}
        </p>
      </Card>

      <button
        type="button"
        onClick={confirmation ? verify : send}
        disabled={busy}
        className="mt-5 w-full rounded-pill bg-coral py-4 font-sans text-[15px] font-medium leading-none tracking-[0.03em] text-foam shadow-[0_8px_22px_rgba(226,138,118,0.38)] transition-colors hover:bg-coral-deep disabled:opacity-60"
      >
        {busy
          ? t(confirmation ? "verifying" : "sending")
          : t(confirmation ? "verify" : "send")}
      </button>

      {confirmation && (
        <div className="mt-4 flex justify-center gap-5">
          <button
            type="button"
            onClick={send}
            disabled={busy}
            className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-coral-ink disabled:opacity-50"
          >
            {t("resend")}
          </button>
          <button
            type="button"
            onClick={editNumber}
            disabled={busy}
            className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-driftwood-soft disabled:opacity-50"
          >
            {t("changeNumber")}
          </button>
        </div>
      )}

      {error && (
        <p
          role="alert"
          className="mt-4 rounded-card bg-coral/15 px-4 py-3 font-sans text-sm text-coral-ink"
        >
          {error}
        </p>
      )}

      {/* Invisible, but it has to be in the DOM before sendOtp runs. */}
      <div id={RECAPTCHA_CONTAINER_ID} />
    </div>
  );
}

function humanError(
  caught: unknown,
  t: (key: string) => string
): string {
  if (!(caught instanceof FirebaseError)) return t("errors.generic");

  switch (caught.code) {
    case "auth/invalid-phone-number":
    case "auth/missing-phone-number":
      return t("errors.badNumber");
    case "auth/invalid-verification-code":
    case "auth/missing-verification-code":
      return t("errors.badCode");
    case "auth/code-expired":
      return t("errors.expired");
    case "auth/too-many-requests":
      return t("errors.tooMany");
    case "auth/network-request-failed":
      return t("errors.network");
    default:
      return t("errors.generic");
  }
}
