"use client";

/**
 * The venue QR's landing — `/join`.
 *
 * Not an RSVP and not a form to fill in: the couple has already settled who is
 * coming, and the QR codes around the venue exist to get a guest into the live
 * features (chat, photos, polls, memories, song requests) in one tap. So the
 * primary path is Google, which is a single tap on an Android phone that is
 * already signed in to it. Phone OTP is the secondary option for a guest
 * without a Google account.
 *
 * Neither path counts as an RSVP identity. `RsvpFlow.isVerified` requires a
 * phone number on the account, so a Google guest who later opens `/rsvp` is
 * shown the phone gate — one number, one reply still holds.
 *
 * Navigation is driven by the auth listener alone, never by the sign-in call's
 * return value: the popup path, the redirect path and a guest who simply arrives
 * already signed in all converge on the same "non-anonymous user appeared" event.
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FirebaseError } from "firebase/app";
import { onAuthStateChanged, type ConfirmationResult } from "firebase/auth";
import { motion } from "motion/react";
import { AppShell } from "@/components/layout/AppShell";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Palm } from "@/components/motifs";
import { Card, Eyebrow, TextField, WaveRule } from "@/components/rsvp/ui";
import { COUPLE, type Tier } from "@/content/wedding";
import { resetVerifier, sendOtp, toE164 } from "@/lib/firebase/auth";
import { getFirebase } from "@/lib/firebase/client";
import {
  completeGoogleRedirect,
  ensureLocalPersistence,
  isSilentAuthError,
  signInGuestWithGoogle,
} from "@/lib/firebase/guestAuth";

// Its own id: the RSVP gate and the dashboard each mount a verifier of their
// own, and a shared id would hand a second verifier a node the first owns.
const RECAPTCHA_CONTAINER_ID = "shorelines-join-recaptcha";

type Status = "checking" | "ready" | "in";

export function JoinScreen({ next, tier }: { next: string; tier: Tier }) {
  const t = useTranslations("join");
  const router = useRouter();

  const [status, setStatus] = useState<Status>("checking");
  const [busy, setBusy] = useState<"google" | "phone" | null>(null);
  const [showPhone, setShowPhone] = useState(false);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [confirmation, setConfirmation] = useState<ConfirmationResult | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);

  const navigated = useRef(false);

  useEffect(() => resetVerifier, []);

  // One listener decides everything. `authSettled` / `redirectSettled` keep the
  // options hidden until both persistence has been read back and any pending
  // Google redirect has been collected — otherwise a guest returning from the
  // redirect would flash the sign-in buttons before being let through.
  useEffect(() => {
    const { auth } = getFirebase();
    let authSettled = false;
    let redirectSettled = false;
    let signedIn = false;

    function settle() {
      if (signedIn) return;
      if (authSettled && redirectSettled) {
        setStatus((current) => (current === "checking" ? "ready" : current));
      }
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      authSettled = true;
      if (user && !user.isAnonymous) {
        signedIn = true;
        setStatus("in");
        if (!navigated.current) {
          navigated.current = true;
          // Long enough to read "You're in", short enough not to feel like a wait.
          setTimeout(() => router.replace(next), 700);
        }
        return;
      }
      settle();
    });

    completeGoogleRedirect()
      .catch((caught) => {
        if (!isSilentAuthError(caught)) setError(humanError(caught, t));
      })
      .finally(() => {
        redirectSettled = true;
        settle();
      });

    return unsubscribe;
    // `t` is stable per locale; the effect must not re-run on re-render or it
    // would re-collect the (already consumed) redirect result.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [next, router]);

  async function google() {
    setError(null);
    setBusy("google");
    try {
      await signInGuestWithGoogle();
      // On success the auth listener navigates. A `null` result means the page
      // is handing off to a redirect and is about to unload.
    } catch (caught) {
      if (!isSilentAuthError(caught)) setError(humanError(caught, t));
    } finally {
      setBusy(null);
    }
  }

  const e164 = toE164(phone);

  async function send() {
    setError(null);
    if (!e164) {
      setError(t("errors.badNumber"));
      return;
    }
    setBusy("phone");
    try {
      await ensureLocalPersistence();
      setConfirmation(await sendOtp(e164, RECAPTCHA_CONTAINER_ID));
      setCode("");
    } catch (caught) {
      setError(humanError(caught, t));
    } finally {
      setBusy(null);
    }
  }

  async function verify() {
    setError(null);
    if (!confirmation) return;
    setBusy("phone");
    try {
      await confirmation.confirm(code.trim());
    } catch (caught) {
      setError(humanError(caught, t));
    } finally {
      setBusy(null);
    }
  }

  function editNumber() {
    setError(null);
    setConfirmation(null);
    setCode("");
    resetVerifier();
  }

  return (
    <AppShell tier={tier}>
      <div className="flex-1 overflow-y-auto px-6 pb-10 pt-6">
        <LanguageSwitcher className="justify-center pb-4" />

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="text-center"
        >
          <Palm className="mx-auto h-14 w-14" short />
          <Eyebrow className="mt-3">
            {COUPLE.partnerA} &amp; {COUPLE.partnerB}
          </Eyebrow>

          {status === "in" ? (
            <SignedIn t={t} onContinue={() => router.replace(next)} />
          ) : status === "checking" ? (
            <p
              role="status"
              className="mt-10 font-sans text-sm text-driftwood-soft"
            >
              {t("checking")}
            </p>
          ) : (
            <>
              <h1 className="mt-2 font-display text-[40px] leading-none text-deeptide">
                {t("title")}
              </h1>
              <p className="mx-auto mt-3 max-w-xs font-sans text-sm leading-[1.6] text-driftwood-soft">
                {t("intro")}
              </p>
              <div className="mt-3 flex justify-center text-warmgold">
                <WaveRule />
              </div>
            </>
          )}
        </motion.div>

        {status === "ready" && (
          <div className="mx-auto mt-6 max-w-sm">
            <button
              type="button"
              onClick={() => void google()}
              disabled={busy !== null}
              className="flex w-full items-center justify-center gap-3 rounded-pill bg-white py-4 font-sans text-[15px] font-medium leading-none tracking-[0.02em] text-driftwood shadow-[0_6px_18px_rgba(51,48,43,0.12)] ring-1 ring-hairline/60 transition-colors hover:bg-card disabled:opacity-60"
            >
              <GoogleMark />
              {busy === "google" ? t("signingIn") : t("google")}
            </button>

            <div className="my-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-hairline/60" />
              <span className="font-sans text-[11px] uppercase tracking-[0.18em] text-driftwood-faint">
                {t("or")}
              </span>
              <span className="h-px flex-1 bg-hairline/60" />
            </div>

            {showPhone ? (
              <div className="animate-fade-in">
                <Card>
                  {confirmation ? (
                    <>
                      <p className="mb-3 font-sans text-[13px] leading-snug text-driftwood-soft">
                        {t("codeIntro", { phone: e164 ?? phone })}
                      </p>
                      <TextField
                        label={t("codeLabel")}
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        className="bg-white/70 px-3 py-2.5 tracking-[0.3em]"
                      />
                    </>
                  ) : (
                    <>
                      <TextField
                        label={t("numberLabel")}
                        type="tel"
                        autoComplete="tel"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="bg-white/70 px-3 py-2.5"
                      />
                      <p className="mt-2 font-sans text-[12.5px] leading-snug text-driftwood-soft">
                        {t("numberHint")}
                      </p>
                    </>
                  )}
                </Card>

                <button
                  type="button"
                  onClick={() => void (confirmation ? verify() : send())}
                  disabled={busy !== null}
                  className="mt-4 w-full rounded-pill bg-coral py-4 font-sans text-[15px] font-medium leading-none tracking-[0.03em] text-foam shadow-[0_8px_22px_rgba(226,138,118,0.38)] transition-colors hover:bg-coral-deep disabled:opacity-60"
                >
                  {busy === "phone"
                    ? t(confirmation ? "verifying" : "sending")
                    : t(confirmation ? "verify" : "send")}
                </button>

                {confirmation && (
                  <div className="mt-4 flex justify-center gap-5">
                    <button
                      type="button"
                      onClick={() => void send()}
                      disabled={busy !== null}
                      className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-coral-ink disabled:opacity-50"
                    >
                      {t("resend")}
                    </button>
                    <button
                      type="button"
                      onClick={editNumber}
                      disabled={busy !== null}
                      className="font-sans text-xs font-medium uppercase tracking-[0.14em] text-driftwood-soft disabled:opacity-50"
                    >
                      {t("changeNumber")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowPhone(true)}
                className="w-full rounded-pill bg-card py-3.5 font-sans text-[14px] font-medium text-deeptide transition-colors hover:bg-card-hover"
              >
                {t("usePhone")}
              </button>
            )}

            {error && (
              <p
                role="alert"
                className="mt-4 rounded-card bg-coral/15 px-4 py-3 text-left font-sans text-sm text-coral-ink"
              >
                {error}
              </p>
            )}

            <p className="mt-6 text-center font-sans text-[12px] leading-snug text-driftwood-faint">
              {t("footnote")}
            </p>
          </div>
        )}

        {/* Invisible, but it has to be in the DOM before sendOtp runs. */}
        <div id={RECAPTCHA_CONTAINER_ID} />
      </div>
    </AppShell>
  );
}

function SignedIn({
  t,
  onContinue,
}: {
  t: (key: string) => string;
  onContinue: () => void;
}) {
  return (
    <div className="animate-fade-in">
      <h1 className="mt-2 font-display text-[40px] leading-none text-deeptide">
        {t("signedInTitle")}
      </h1>
      <p className="mx-auto mt-3 max-w-xs font-sans text-sm leading-[1.6] text-driftwood-soft">
        {t("signedInBody")}
      </p>
      <button
        type="button"
        onClick={onContinue}
        className="mx-auto mt-6 block w-full max-w-sm rounded-pill bg-deeptide py-4 font-sans text-[15px] font-medium leading-none tracking-[0.03em] text-foam transition-colors hover:bg-deeptide-deep"
      >
        {t("continue")}
      </button>
    </div>
  );
}

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden className="size-5 flex-none">
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z"
      />
      <path
        fill="#FBBC05"
        d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z"
      />
    </svg>
  );
}

function humanError(caught: unknown, t: (key: string) => string): string {
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
